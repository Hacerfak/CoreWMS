using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology;

// ==============================================================================
// 1. DTOs & CONTRATOS
// ==============================================================================

// NOVO: Adicionados totais base e estimados
public record ZoneDto(Guid Id, Guid WarehouseId, string Code, string Name, bool IsActive, int TotalBaseCapacity, int TotalEstimatedCapacity);

public record CreateZoneCommand(Guid WarehouseId, string Code, string Name) : IRequest<IResult>;
public record UpdateZoneCommand(Guid Id, string Name) : IRequest<IResult>;
public record DeleteZoneCommand(Guid Id) : IRequest<IResult>;

// NOVO: Recebe a altura do palete do simulador
public record ListZonesQuery(Guid WarehouseId, decimal PalletHeight) : IRequest<IResult>;

// ==============================================================================
// 2. VALIDADORES
// ==============================================================================

public class CreateZoneCommandValidator : AbstractValidator<CreateZoneCommand>
{
    public CreateZoneCommandValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
    }
}

public class UpdateZoneCommandValidator : AbstractValidator<UpdateZoneCommand>
{
    public UpdateZoneCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
    }
}

// ==============================================================================
// 3. HANDLERS
// ==============================================================================

public class CreateZoneHandler : IRequestHandler<CreateZoneCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateZoneHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateZoneCommand request, CancellationToken ct)
    {
        if (!await _db.Warehouses.AnyAsync(w => w.Id == request.WarehouseId, ct))
            return Results.NotFound(new { Message = "Pavilhão não encontrado." });

        if (await _db.Zones.AnyAsync(z => z.WarehouseId == request.WarehouseId && z.Code.ToUpper() == request.Code.ToUpper(), ct))
            return Results.BadRequest(new { Message = "Já existe uma Zona com este código neste pavilhão." });

        var zone = new Zone(request.WarehouseId, request.Code, request.Name);
        _db.Zones.Add(zone);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/topology/zones/{zone.Id}", new ZoneDto(zone.Id, zone.WarehouseId, zone.Code, zone.Name, zone.IsActive, 0, 0));
    }
}

public class UpdateZoneHandler : IRequestHandler<UpdateZoneCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateZoneHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateZoneCommand request, CancellationToken ct)
    {
        var zone = await _db.Zones.FindAsync(new object[] { request.Id }, ct);
        if (zone == null) return Results.NotFound(new { Message = "Zona não encontrada." });

        zone.Update(request.Name);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// CÁLCULO INTELIGENTE DA ZONA
public class ListZonesHandler : IRequestHandler<ListZonesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListZonesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListZonesQuery request, CancellationToken ct)
    {
        var safePalletHeight = request.PalletHeight <= 0 ? 1.5m : request.PalletHeight;

        var zones = await _db.Zones
            .AsNoTracking()
            .Include(z => z.Warehouse)
            .Include(z => z.Locations)
                .ThenInclude(l => l.StorageType)
            .Where(z => z.WarehouseId == request.WarehouseId)
            .ToListAsync(ct);

        var dtos = zones.Select(z =>
        {
            int totalBase = 0;
            int totalEst = 0;
            var clearance = z.Warehouse.ClearanceHeight;

            foreach (var l in z.Locations)
            {
                totalBase += l.BaseCapacity;
                int locMax = l.BaseCapacity;
                if (l.StorageType.CapacityStrategy == Enums.StorageCapacityStrategy.DynamicStacking)
                {
                    var maxStacking = (int)Math.Max(1, Math.Floor(clearance / safePalletHeight));
                    locMax = l.BaseCapacity * maxStacking;
                }
                totalEst += locMax;
            }

            return new ZoneDto(z.Id, z.WarehouseId, z.Code, z.Name, z.IsActive, totalBase, totalEst);
        }).OrderBy(z => z.Code).ToList();

        return Results.Ok(dtos);
    }
}

public class DeleteZoneHandler : IRequestHandler<DeleteZoneCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteZoneHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteZoneCommand request, CancellationToken ct)
    {
        var zone = await _db.Zones.FindAsync(new object[] { request.Id }, ct);
        if (zone == null) return Results.NotFound();

        try
        {
            _db.Zones.Remove(zone);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir esta zona pois existem endereços vinculados a ela." });
        }

        return Results.NoContent();
    }
}

// ==============================================================================
// 4. ENDPOINTS
// ==============================================================================

public static class ZoneEndpoints
{
    public static void MapZoneEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/topology/zones").WithTags("Topology").RequireAuthorization();

        group.MapPost("/", async (CreateZoneCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
        group.MapPut("/{id:guid}", async (Guid id, UpdateZoneCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        // Recebe do Front a altura de simulação via Query Parameter
        group.MapGet("/{warehouseId:guid}", async (Guid warehouseId, [FromQuery] decimal? palletHeight, IMediator mediator) => await mediator.Send(new ListZonesQuery(warehouseId, palletHeight ?? 1.5m))).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteZoneCommand(id))).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
    }
}