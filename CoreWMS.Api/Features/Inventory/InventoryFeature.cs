using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Core.Models;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory;

// ==========================================
// 1. CONTRATOS E DTOs
// ==========================================
public record HandlingUnitDto(Guid Id, string Lpn, string CustomerName, string ProductSku, string PackagingTypeCode, Guid? CurrentLocationId, string? LocationPath, string? Batch, DateTime? ManufactureDate, DateTime? ExpirationDate, string? SerialNumber, decimal InitialQuantity, decimal CurrentQuantity, string Status, string QualityStatus);
public record InventoryBalanceDto(Guid ProductId, string ProductSku, string CustomerName, decimal TotalExpected, decimal TotalAvailable, decimal TotalAllocated, decimal TotalQuarantine, decimal TotalPhysical);
public record InventoryTransactionDto(Guid Id, DateTime CreatedAt, string ProductSku, string? Lpn, string Type, decimal QuantityChange, decimal BalanceAfter, string? SourceDocumentNumber);

// Queries
public record ListHandlingUnitsQuery(
    Guid? CustomerId, Guid? ProductId, string? Lpn, Guid? LocationId, int? Status,
    int Page = 1, int PageSize = 20) : IRequest<IResult>;
public record GetInventoryBalanceQuery(Guid? CustomerId, Guid? ProductId, int Page = 1, int PageSize = 20) : IRequest<IResult>;
public record ListKardexQuery(
    Guid? ProductId,
    string? Lpn,
    DateTime? StartDate,
    DateTime? EndDate,
    int Page = 1,
    int PageSize = 20) : IRequest<IResult>;

// Commands (Operações)
public record UpdateHandlingUnitCommand(Guid Id, string? Batch, DateTime? ManufactureDate, DateTime? ExpirationDate, string? SerialNumber) : IRequest<IResult>;
public record MoveHandlingUnitCommand(Guid Id, Guid DestinationLocationId) : IRequest<IResult>;
public record ChangeQualityCommand(Guid Id, QualityStatus NewStatus) : IRequest<IResult>;

// ==========================================
// 2. VALIDADORES
// ==========================================
public class MoveHandlingUnitCommandValidator : AbstractValidator<MoveHandlingUnitCommand>
{
    public MoveHandlingUnitCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DestinationLocationId).NotEmpty();
    }
}

public class GetInventoryBalanceQueryValidator : AbstractValidator<GetInventoryBalanceQuery>
{
    public GetInventoryBalanceQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

public class ChangeQualityCommandValidator : AbstractValidator<ChangeQualityCommand>
{
    public ChangeQualityCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.NewStatus).IsInEnum();
    }
}

public class ListHandlingUnitsQueryValidator : AbstractValidator<ListHandlingUnitsQuery>
{
    public ListHandlingUnitsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

public class ListKardexQueryValidator : AbstractValidator<ListKardexQuery>
{
    public ListKardexQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

// ==========================================
// 3. HANDLERS DE CONSULTA (READ)
// ==========================================
public class ListHandlingUnitsHandler : IRequestHandler<ListHandlingUnitsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListHandlingUnitsQuery request, CancellationToken ct)
    {
        // 1. Extração limpa e segura do CompanyId
        var companyId = _tenant.GetCompanyId();

        // 2. Query Base sempre com AsNoTracking()
        var q = _db.HandlingUnits.AsNoTracking()
            .Where(h => h.CompanyId == companyId);

        // 3. Aplicação dos Filtros Dinâmicos
        if (request.CustomerId.HasValue) q = q.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(h => h.ProductId == request.ProductId);
        if (request.LocationId.HasValue) q = q.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.Status.HasValue) q = q.Where(h => h.Status == (HuStatus)request.Status.Value);
        if (!string.IsNullOrWhiteSpace(request.Lpn)) q = q.Where(h => h.Lpn.Contains(request.Lpn.Trim().ToUpper()));

        // 4. Contagem Total para o Frontend montar os botões de página (Otimizado)
        var totalTask = q.CountAsync(ct);

        // 5. Query Paginada com Projeção (Includes limitados ao que é projetado)
        var skip = (request.Page - 1) * request.PageSize;

        var itemsTask = q
            .OrderByDescending(h => h.UpdatedAt ?? h.CreatedAt) // Sempre ordene antes do Skip/Take
            .Skip(skip)
            .Take(request.PageSize)
            .Select(h => new HandlingUnitDto(
                h.Id, h.Lpn, h.Customer.CorporateName, h.Product.Sku, h.PackagingType.Code,
                h.CurrentLocationId, h.CurrentLocation != null ? h.CurrentLocation.FullPath : null,
                h.Batch, h.ManufactureDate, h.ExpirationDate, h.SerialNumber,
                h.InitialQuantity, h.CurrentQuantity, h.Status.ToString(), h.QualityStatus.ToString()
            )).ToListAsync(ct);

        // Executa Count e Select simultaneamente no banco
        await Task.WhenAll(totalTask, itemsTask);

        // 6. Retorna a resposta envelopada
        var response = new PaginatedResult<HandlingUnitDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public class GetInventoryBalanceHandler : IRequestHandler<GetInventoryBalanceQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetInventoryBalanceHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetInventoryBalanceQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.InventoryBalances.AsNoTracking()
            .Include(b => b.Product)
            .Include(b => b.Customer)
            .Where(b => b.CompanyId == companyId);

        if (request.CustomerId.HasValue) q = q.Where(b => b.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(b => b.ProductId == request.ProductId);

        var totalTask = q.CountAsync(ct);

        var itemsTask = q
            .OrderBy(b => b.Product.Sku)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .Select(b => new InventoryBalanceDto(
                b.ProductId, b.Product.Sku, b.Customer.CorporateName,
                b.TotalExpected, b.TotalAvailable, b.TotalAllocated, b.TotalQuarantine, b.TotalPhysical
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<InventoryBalanceDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public class ListKardexHandler : IRequestHandler<ListKardexQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListKardexHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListKardexQuery request, CancellationToken ct)
    {
        // 1. Captura Segura do Tenant
        var companyId = _tenant.GetCompanyId();

        // 2. Monta o JOIN nativo de alta performance no EF Core
        var query = from t in _db.InventoryTransactions.AsNoTracking()
                    where t.CompanyId == companyId
                    join p in _db.Products.AsNoTracking() on t.ProductId equals p.Id
                    // Left Join na HU (pois alguns ajustes de estoque não têm HU vinculada)
                    join h in _db.HandlingUnits.AsNoTracking() on t.HandlingUnitId equals h.Id into hGroup
                    from hu in hGroup.DefaultIfEmpty()
                    select new { Transaction = t, ProductSku = p.Sku, HandlingUnitLpn = hu != null ? hu.Lpn : null };

        // 3. Filtros Dinâmicos
        if (request.ProductId.HasValue)
            query = query.Where(q => q.Transaction.ProductId == request.ProductId);

        if (request.StartDate.HasValue)
            query = query.Where(q => q.Transaction.CreatedAt >= request.StartDate.Value.ToUniversalTime());

        if (request.EndDate.HasValue)
            query = query.Where(q => q.Transaction.CreatedAt <= request.EndDate.Value.ToUniversalTime());

        if (!string.IsNullOrWhiteSpace(request.Lpn))
            query = query.Where(q => q.HandlingUnitLpn == request.Lpn.Trim().ToUpper());

        // 4. Execução Paralela (Count e Select)
        var totalTask = query.CountAsync(ct);

        var skip = (request.Page - 1) * request.PageSize;

        var itemsTask = query
            .OrderByDescending(q => q.Transaction.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(q => new InventoryTransactionDto(
                q.Transaction.Id,
                q.Transaction.CreatedAt,
                q.ProductSku,
                q.HandlingUnitLpn,
                q.Transaction.Type.ToString(),
                q.Transaction.QuantityChange,
                q.Transaction.BalanceAfter,
                q.Transaction.SourceDocumentNumber
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        // 5. Retorna o Objeto Paginado Padrão
        var response = new PaginatedResult<InventoryTransactionDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

// ==========================================
// 4. HANDLERS DE OPERAÇÃO (WRITE)
// ==========================================
public class UpdateHandlingUnitHandler : IRequestHandler<UpdateHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    public UpdateHandlingUnitHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(UpdateHandlingUnitCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound(new { Message = "HU não encontrada." });

        hu.UpdateTraceability(request.Batch, request.ManufactureDate, request.ExpirationDate, request.SerialNumber);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Esta HU foi alterada por outro usuário simultaneamente. Atualize a tela." }); }

        return Results.NoContent();
    }
}

public class MoveHandlingUnitHandler : IRequestHandler<MoveHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly KardexChannel _kardex;

    public MoveHandlingUnitHandler(ApplicationDbContext db, IHttpContextAccessor http, KardexChannel kardex)
    { _db = db; _http = http; _kardex = kardex; }

    public async Task<IResult> Handle(MoveHandlingUnitCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound();

        if (!await _db.Locations.AnyAsync(l => l.Id == request.DestinationLocationId, ct))
            return Results.BadRequest(new { Message = "Endereço de destino inválido." });

        hu.MoveTo(request.DestinationLocationId);

        // Dispara Kardex Assíncrono (Quantidade 0 pois é apenas movimento físico, sem impacto financeiro)
        var transaction = new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, request.DestinationLocationId, TransactionType.Internal_Move, 0, hu.CurrentQuantity, null, null);
        await _kardex.WriteAsync(transaction, ct);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Conflito de concorrência ao mover a HU." }); }

        return Results.NoContent();
    }
}

public class ChangeQualityHandler : IRequestHandler<ChangeQualityCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    private readonly KardexChannel _kardex;

    public ChangeQualityHandler(ApplicationDbContext db, IHttpContextAccessor http, KardexChannel kardex)
    { _db = db; _http = http; _kardex = kardex; }

    public async Task<IResult> Handle(ChangeQualityCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound();

        if (hu.QualityStatus == request.NewStatus) return Results.Ok();

        var balance = await _db.InventoryBalances.FirstOrDefaultAsync(b => b.ProductId == hu.ProductId && b.CompanyId == companyId, ct);
        if (balance == null) return Results.BadRequest(new { Message = "Saldo não encontrado." });

        // Ajusta os baldes de saldo de acordo com a transição
        if (request.NewStatus == QualityStatus.Quarantine && hu.QualityStatus == QualityStatus.Available)
        {
            balance.Quarantine(hu.CurrentQuantity);
            await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Hold, 0, hu.CurrentQuantity, null, null), ct);
        }
        else if (request.NewStatus == QualityStatus.Available && hu.QualityStatus == QualityStatus.Quarantine)
        {
            balance.ReleaseFromQuarantine(hu.CurrentQuantity);
            await _kardex.WriteAsync(new InventoryTransaction(companyId, hu.CustomerId, hu.ProductId, hu.Id, hu.CurrentLocationId, TransactionType.Quality_Release, 0, hu.CurrentQuantity, null, null), ct);
        }

        hu.ChangeQuality(request.NewStatus);

        try { await _db.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException) { return Results.Conflict(new { Message = "Conflito de concorrência ao alterar status de qualidade da HU e Saldo." }); }

        return Results.NoContent();
    }
}

// ==========================================
// 5. ENDPOINTS
// ==========================================
public static class InventoryEndpoints
{
    public static void MapInventoryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inventory").WithTags("Inventory").RequireAuthorization();

        // Consultas (Leitura)
        group.MapGet("/handling-units", async ([AsParameters] ListHandlingUnitsQuery query, IMediator mediator) =>
            await mediator.Send(query)).RequirePermission(Permissions.Inventory.View);

        group.MapGet("/balances", async ([AsParameters] GetInventoryBalanceQuery query, IMediator mediator) =>
            await mediator.Send(query)).RequirePermission(Permissions.Inventory.View);

        group.MapGet("/kardex", async ([AsParameters] ListKardexQuery query, IMediator mediator) =>
            await mediator.Send(query)).RequirePermission(Permissions.Inventory.View);

        // Operações Seguras (Escrita)
        group.MapPut("/handling-units/{id:guid}/traceability", async (Guid id, UpdateHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id })).RequirePermission(Permissions.Inventory.EditTraceability);

        group.MapPost("/handling-units/{id:guid}/move", async (Guid id, MoveHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id })).RequirePermission(Permissions.Inventory.Move);

        group.MapPost("/handling-units/{id:guid}/quality", async (Guid id, ChangeQualityCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id })).RequirePermission(Permissions.Inventory.ManageQuality);
    }
}