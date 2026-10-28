using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

// ----------------------------------------------------------------------------
// 1. ATUALIZAÇÃO INDIVIDUAL
// ----------------------------------------------------------------------------
public record UpdateHandlingUnitCommand(
    Guid Id,
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate,
    string? SerialNumber,
    DateTime? CreatedAt,
    Guid? PackagingTypeId,
    decimal? UnitNetWeight,
    decimal? UnitGrossWeight,
    DateTime? ConsumedAt = null
) : IRequest<IResult>;

public class UpdateHandlingUnitCommandValidator : AbstractValidator<UpdateHandlingUnitCommand>
{
    public UpdateHandlingUnitCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("ID da HU obrigatório.");

        RuleFor(x => x.UnitNetWeight)
            .GreaterThanOrEqualTo(0).When(x => x.UnitNetWeight.HasValue)
            .WithMessage("O peso líquido unitário não pode ser negativo.");

        RuleFor(x => x.UnitGrossWeight)
            .GreaterThanOrEqualTo(0).When(x => x.UnitGrossWeight.HasValue)
            .WithMessage("O peso bruto unitário não pode ser negativo.");

        RuleFor(x => x)
            .Must(x => !x.UnitNetWeight.HasValue || !x.UnitGrossWeight.HasValue || x.UnitGrossWeight >= x.UnitNetWeight)
            .WithMessage("O peso bruto unitário não pode ser menor que o peso líquido.");
    }
}

public class UpdateHandlingUnitHandler : IRequestHandler<UpdateHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound(new { Message = "HU não encontrada." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(hu.CustomerId))
            return Results.Forbid();

        hu.UpdateFullDetails(
            request.Batch,
            request.ManufactureDate,
            request.ExpirationDate,
            request.SerialNumber,
            request.CreatedAt,
            request.PackagingTypeId,
            request.UnitNetWeight,
            request.UnitGrossWeight,
            request.ConsumedAt
        );

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Esta HU foi alterada por outro usuário simultaneamente. Atualize a tela." });
        }

        return Results.Ok(new { Message = "Dados da HU atualizados com sucesso!" });
    }
}

// ----------------------------------------------------------------------------
// 2. ATUALIZAÇÃO EM LOTE (BATCH)
// ----------------------------------------------------------------------------
public record UpdateBatchHandlingUnitsCommand(
    List<Guid> HandlingUnitIds,
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate,
    DateTime? CreatedAt,
    Guid? PackagingTypeId,
    decimal? UnitNetWeight,
    decimal? UnitGrossWeight
) : IRequest<IResult>;

public class UpdateBatchHandlingUnitsCommandValidator : AbstractValidator<UpdateBatchHandlingUnitsCommand>
{
    public UpdateBatchHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds)
            .NotEmpty().WithMessage("Selecione ao menos uma HU para edição em lote.");

        RuleFor(x => x.UnitNetWeight)
            .GreaterThanOrEqualTo(0).When(x => x.UnitNetWeight.HasValue)
            .WithMessage("O peso líquido unitário não pode ser negativo.");

        RuleFor(x => x.UnitGrossWeight)
            .GreaterThanOrEqualTo(0).When(x => x.UnitGrossWeight.HasValue)
            .WithMessage("O peso bruto unitário não pode ser negativo.");

        RuleFor(x => x)
            .Must(x => !x.UnitNetWeight.HasValue || !x.UnitGrossWeight.HasValue || x.UnitGrossWeight >= x.UnitNetWeight)
            .WithMessage("O peso bruto unitário não pode ser menor que o peso líquido.");
    }
}

public class UpdateBatchHandlingUnitsHandler : IRequestHandler<UpdateBatchHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateBatchHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateBatchHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.HandlingUnits
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id));

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(h => allowedIds.Contains(h.CustomerId));
        }

        var hus = await query.ToListAsync(ct);
        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma HU válida encontrada para atualização." });

        foreach (var hu in hus)
        {
            hu.UpdateBatchDetails(
                request.Batch,
                request.ManufactureDate,
                request.ExpirationDate,
                request.CreatedAt,
                request.PackagingTypeId,
                request.UnitNetWeight,
                request.UnitGrossWeight
            );
        }

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Conflito de concorrência ao atualizar as HUs em lote. Atualize a tela e tente novamente." });
        }

        return Results.Ok(new
        {
            Message = $"{hus.Count} HUs atualizadas em lote com sucesso!",
            UpdatedCount = hus.Count
        });
    }
}

// ----------------------------------------------------------------------------
// ENDPOINTS
// ----------------------------------------------------------------------------
public static class UpdateHandlingUnitEndpoints
{
    public static void MapUpdateHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        // PUT /api/inventory/handling-units/{id}
        app.MapPut("/api/inventory/handling-units/{id:guid}", async (Guid id, UpdateHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.EditTraceability);

        // PUT /api/inventory/handling-units/batch
        app.MapPut("/api/inventory/handling-units/batch", async (UpdateBatchHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.EditTraceability);
    }
}