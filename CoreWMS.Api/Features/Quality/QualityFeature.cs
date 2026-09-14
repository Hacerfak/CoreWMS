using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Quality.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality;

// ==========================================
// 1. DTOs E CONTRATOS
// ==========================================
public record QualityReasonDto(Guid Id, string Code, string Description, bool IsActive);
public record QualityImageDto(string FileName, string Base64Data);

// Queries
public record ListQualityReasonsQuery() : IRequest<IResult>;

// Commands
public record CreateQualityReasonCommand(string Code, string Description) : IRequest<IResult>;
public record HoldHandlingUnitCommand(Guid HandlingUnitId, Guid ReasonId, string Notes, Guid? QualityLocationId, List<QualityImageDto>? Images) : IRequest<IResult>;
public record ReleaseHandlingUnitCommand(Guid EventId, Guid ReasonId, string Notes) : IRequest<IResult>;

// ==========================================
// 2. HANDLERS
// ==========================================
public class CreateQualityReasonHandler : IRequestHandler<CreateQualityReasonCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    public CreateQualityReasonHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(CreateQualityReasonCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        if (await _db.QualityReasons.AnyAsync(r => r.CompanyId == companyId && r.Code == request.Code, ct))
            return Results.BadRequest(new { Message = "Código de motivo já existe." });

        var reason = new QualityReason(companyId, request.Code, request.Description);
        _db.QualityReasons.Add(reason);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { reason.Id });
    }
}

public class HoldHandlingUnitHandler : IRequestHandler<HoldHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly KardexChannel _kardex;

    public HoldHandlingUnitHandler(ApplicationDbContext db, IHttpContextAccessor http, KardexChannel kardex)
    { _db = db; _http = http; _kardex = kardex; }

    public async Task<IResult> Handle(HoldHandlingUnitCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.HandlingUnitId && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound(new { Message = "HU não encontrada." });

        if (hu.QualityStatus == QualityStatus.Quarantine)
            return Results.BadRequest(new { Message = "HU já está bloqueada." });

        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.ProductId == hu.ProductId && b.CompanyId == companyId, ct);
        if (balance == null) return Results.BadRequest(new { Message = "Saldo consolidado não encontrado." });

        // 1. Cria o Evento (Prontuário)
        var qualityEvent = new QualityEvent(companyId, hu.Id, hu.CurrentLocationId, request.ReasonId, request.Notes);
        if (request.Images != null)
        {
            foreach (var img in request.Images)
                qualityEvent.AddImage(img.FileName, img.Base64Data);
        }
        _db.QualityEvents.Add(qualityEvent);

        // 2. Modifica a Qualidade e os Baldes de Saldo
        hu.ChangeQuality(QualityStatus.Quarantine);
        balance.Quarantine(hu.CurrentQuantity);

        // 3. Move fisicamente para o endereço de Qualidade (Se informado)
        if (request.QualityLocationId.HasValue)
        {
            hu.MoveTo(request.QualityLocationId.Value);
            await _kardex.WriteAsync(new Features.Inventory.Entities.InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, request.QualityLocationId.Value, TransactionType.Internal_Move, 0, hu.CurrentQuantity, null, null), ct);
        }

        // 4. Registra auditoria financeira no Kardex
        await _kardex.WriteAsync(new Features.Inventory.Entities.InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Hold, 0, hu.CurrentQuantity, null, null), ct);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Conflito de concorrência. A HU ou o Saldo foram alterados simultaneamente." }); }

        return Results.NoContent();
    }
}

public class ReleaseHandlingUnitHandler : IRequestHandler<ReleaseHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly KardexChannel _kardex;

    public ReleaseHandlingUnitHandler(ApplicationDbContext db, IHttpContextAccessor http, KardexChannel kardex)
    { _db = db; _http = http; _kardex = kardex; }

    public async Task<IResult> Handle(ReleaseHandlingUnitCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var qEvent = await _db.QualityEvents
            .Include(q => q.HandlingUnit)
            .FirstOrDefaultAsync(q => q.Id == request.EventId && q.CompanyId == companyId, ct);

        if (qEvent == null || qEvent.IsResolved)
            return Results.BadRequest(new { Message = "Evento inválido ou já resolvido." });

        var hu = qEvent.HandlingUnit;
        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.ProductId == hu.ProductId && b.CompanyId == companyId, ct);

        // 1. Resolve o Evento
        qEvent.Resolve(request.ReasonId, request.Notes);

        // 2. Devolve para o Saldo Disponível
        hu.ChangeQuality(QualityStatus.Available);
        balance?.ReleaseFromQuarantine(hu.CurrentQuantity);

        // 3. Devolve para o Endereço Original (Se a HU foi movida para a gaiola de qualidade)
        if (qEvent.OriginalLocationId.HasValue && hu.CurrentLocationId != qEvent.OriginalLocationId)
        {
            hu.MoveTo(qEvent.OriginalLocationId.Value);
            await _kardex.WriteAsync(new Features.Inventory.Entities.InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, qEvent.OriginalLocationId.Value, TransactionType.Internal_Move, 0, hu.CurrentQuantity, null, null), ct);
        }

        // 4. Kardex
        await _kardex.WriteAsync(new Features.Inventory.Entities.InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Release, 0, hu.CurrentQuantity, null, null), ct);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Conflito de concorrência." }); }

        return Results.NoContent();
    }
}

// ==========================================
// 3. ENDPOINTS
// ==========================================
public static class QualityEndpoints
{
    public static void MapQualityEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/quality").WithTags("Quality").RequireAuthorization();

        // Cadastros Base
        group.MapPost("/reasons", async (CreateQualityReasonCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Inventory.ManageQuality);
        group.MapGet("/reasons", async (IHttpContextAccessor http, ApplicationDbContext db) =>
        {
            var companyId = Guid.Parse(http.HttpContext!.Request.Headers["X-Company-Id"].ToString());
            return Results.Ok(await db.QualityReasons.Where(r => r.CompanyId == companyId).Select(r => new QualityReasonDto(r.Id, r.Code, r.Description, r.IsActive)).ToListAsync());
        }).RequirePermission(Permissions.Inventory.View);

        // Operações de Qualidade da HU
        group.MapPost("/hold", async (HoldHandlingUnitCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Inventory.ManageQuality);
        group.MapPost("/events/{eventId:guid}/release", async (Guid eventId, ReleaseHandlingUnitCommand cmd, IMediator mediator) => await mediator.Send(cmd with { EventId = eventId })).RequirePermission(Permissions.Inventory.ManageQuality);
    }
}