using System.Security.Claims;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record ChangeQualityCommand(List<Guid> HandlingUnitIds, QualityStatus NewStatus, string? Reason) : IRequest<IResult>;

public class ChangeQualityCommandValidator : AbstractValidator<ChangeQualityCommand>
{
    public ChangeQualityCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Selecione ao menos uma Unidade de Manuseio (HU).");
        RuleFor(x => x.NewStatus).IsInEnum().WithMessage("Status de qualidade inválido.");
        RuleFor(x => x.Reason).MaximumLength(250).WithMessage("O motivo deve ter no máximo 250 caracteres.");
    }
}

public class ChangeQualityHandler : IRequestHandler<ChangeQualityCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IMediator _mediator;
    private readonly IHttpContextAccessor _http;
    private readonly IMemoryCache _cache;

    public ChangeQualityHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IMediator mediator,
        IHttpContextAccessor http,
        IMemoryCache cache)
    {
        _db = db;
        _tenant = tenant;
        _mediator = mediator;
        _http = http;
        _cache = cache;
    }

    public async Task<IResult> Handle(ChangeQualityCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Guarda granular: liberar HU (Available) exige Permissions.Quality.Release
        if (request.NewStatus == QualityStatus.Available)
        {
            var user = _http.HttpContext?.User;
            var isMaster = string.Equals(user?.FindFirst("isMaster")?.Value, "true", StringComparison.OrdinalIgnoreCase);
            var userIdClaim = user?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            bool canRelease = isMaster;
            if (!canRelease && Guid.TryParse(userIdClaim, out var userId))
            {
                if (_cache.TryGetValue($"perm:{userId}:{companyId}", out HashSet<string>? cachedPerms) && cachedPerms != null)
                {
                    canRelease = cachedPerms.Contains(Permissions.Quality.Release);
                }
                else
                {
                    canRelease = await _db.UserCompanyRoles
                        .Where(ucr => ucr.UserId == userId && ucr.CompanyId == companyId)
                        .SelectMany(ucr => ucr.Role.Permissions)
                        .AnyAsync(p => p.Permission == Permissions.Quality.Release, ct);
                }
            }

            if (!canRelease)
            {
                return Results.Problem(
                    statusCode: StatusCodes.Status403Forbidden,
                    title: "Acesso Negado",
                    detail: $"Seu perfil não possui a permissão '{Permissions.Quality.Release}' para liberar unidades de manuseio.");
            }
        }

        // 2. Busca as HUs respeitando Tenant e Viseira B2B
        var query = _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id));

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma Unidade de Manuseio (HU) válida foi encontrada." });

        // 3. Bloqueia alteração em HUs já encerradas/expedidas ou ainda não recebidas
        var invalidStatusHus = hus
            .Where(h => h.Status == HuStatus.Consumed || h.Status == HuStatus.Shipped || h.Status == HuStatus.Expected)
            .Select(h => h.Lpn)
            .ToList();

        if (invalidStatusHus.Any())
        {
            return Results.BadRequest(new
            {
                Message = $"Não é possível alterar o status de qualidade das seguintes HUs devido ao seu estado físico atual: {string.Join(", ", invalidStatusHus)}."
            });
        }

        // 4. Se for liberação (Available), impede deixar ocorrências formais abertas em QualityEvents
        if (request.NewStatus == QualityStatus.Available)
        {
            var huIds = hus.Select(h => h.Id).ToList();
            var husWithOpenEvents = await _db.QualityEvents
                .AsNoTracking()
                .Where(q => q.CompanyId == companyId && !q.IsResolved && huIds.Contains(q.HandlingUnitId))
                .Select(q => q.HandlingUnit.Lpn)
                .Distinct()
                .ToListAsync(ct);

            if (husWithOpenEvents.Any())
            {
                return Results.BadRequest(new
                {
                    Message = $"As HUs ({string.Join(", ", husWithOpenEvents)}) possuem ocorrências abertas na Qualidade. Realize a liberação técnica informando o motivo no módulo de Qualidade."
                });
            }
        }

        var productIds = hus.Select(h => h.ProductId).Distinct().ToList();
        var customerIds = hus.Select(h => h.CustomerId).Distinct().ToList();

        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId) && customerIds.Contains(b.CustomerId))
            .ToListAsync(ct);

        int updatedCount = 0;
        var kardexMovements = new List<RecordKardexMovementItemDto>();

        foreach (var hu in hus)
        {
            if (hu.QualityStatus == request.NewStatus) continue;

            var oldStatus = hu.QualityStatus;
            var balance = balances.FirstOrDefault(b => b.ProductId == hu.ProductId && b.CustomerId == hu.CustomerId);

            // Só altera as gavetas do InventoryBalance se a HU já saiu da Doca (Received mantém no balde TotalDock)
            if (hu.Status != HuStatus.Received && balance != null)
            {
                balance.ChangeQualityForStored(hu.CurrentQuantity, oldStatus, request.NewStatus);
            }

            hu.ChangeQuality(request.NewStatus);

            var movementType = request.NewStatus == QualityStatus.Available
                ? TransactionType.Quality_Release
                : TransactionType.Quality_Hold;

            var reasonText = $"ALTERAÇÃO QUALIDADE ({oldStatus} -> {request.NewStatus}): {request.Reason ?? "Sem observação"}";

            kardexMovements.Add(new RecordKardexMovementItemDto(
                CustomerId: hu.CustomerId,
                ProductId: hu.ProductId,
                HandlingUnitId: hu.Id,
                LocationId: hu.CurrentLocationId,
                Type: movementType,
                QuantityChange: 0m,
                BalanceAfter: hu.CurrentQuantity,
                SourceDocumentId: hu.ReceiptDocumentId,
                SourceDocumentNumber: reasonText,
                CompanyId: companyId
            ));

            updatedCount++;
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao atualizar a qualidade dos itens. Tente novamente." });
        }

        // DELEGAÇÃO VIA MEDIATR: Gravação segura em lote no Kardex
        if (kardexMovements.Any())
        {
            await _mediator.Send(new RecordBatchKardexMovementsCommand(kardexMovements), ct);
        }

        return Results.Ok(new
        {
            Message = $"{updatedCount} Unidade(s) de Manuseio atualizada(s) para o status '{request.NewStatus}'.",
            UpdatedCount = updatedCount
        });
    }
}

public static class ChangeQualityEndpoints
{
    public static void MapChangeQualityEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/handling-units/quality", async (ChangeQualityCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Quality.Hold);
    }
}