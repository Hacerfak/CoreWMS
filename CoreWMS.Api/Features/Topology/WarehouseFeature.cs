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
public record WarehouseDto(Guid Id, string Code, string Name, decimal ClearanceHeight, bool IsActive, int TotalBaseCapacity, int TotalEstimatedCapacity);

public record CreateWarehouseCommand(string Code, string Name, decimal ClearanceHeight) : IRequest<IResult>;
public record UpdateWarehouseCommand(Guid Id, string Name, decimal ClearanceHeight) : IRequest<IResult>;
public record DeleteWarehouseCommand(Guid Id) : IRequest<IResult>;

// NOVO: Recebe a altura do palete do simulador
public record ListWarehousesQuery(decimal PalletHeight) : IRequest<IResult>;

// ==============================================================================
// 2. VALIDADORES
// ==============================================================================

public class CreateWarehouseCommandValidator : AbstractValidator<CreateWarehouseCommand>
{
    public CreateWarehouseCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ClearanceHeight).GreaterThan(0).WithMessage("O pé direito deve ser maior que zero.");
    }
}

public class UpdateWarehouseCommandValidator : AbstractValidator<UpdateWarehouseCommand>
{
    public UpdateWarehouseCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ClearanceHeight).GreaterThan(0);
    }
}

// ==============================================================================
// 3. HANDLERS
// ==============================================================================

public class CreateWarehouseHandler : IRequestHandler<CreateWarehouseCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateWarehouseHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateWarehouseCommand request, CancellationToken ct)
    {
        if (await _db.Warehouses.AnyAsync(w => w.Code.ToUpper() == request.Code.ToUpper(), ct))
            return Results.BadRequest(new { Message = "Já existe um Pavilhão com este código." });

        var warehouse = new Warehouse(request.Code, request.Name, request.ClearanceHeight);
        _db.Warehouses.Add(warehouse);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/topology/warehouses/{warehouse.Id}", new WarehouseDto(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.ClearanceHeight, warehouse.IsActive, 0, 0));
    }
}

public class UpdateWarehouseHandler : IRequestHandler<UpdateWarehouseCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateWarehouseHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateWarehouseCommand request, CancellationToken ct)
    {
        var warehouse = await _db.Warehouses.FindAsync(new object[] { request.Id }, ct);
        if (warehouse == null) return Results.NotFound(new { Message = "Pavilhão não encontrado." });

        warehouse.Update(request.Name, request.ClearanceHeight);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// CÁLCULO INTELIGENTE DO PAVILHÃO
public class ListWarehousesHandler : IRequestHandler<ListWarehousesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListWarehousesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListWarehousesQuery request, CancellationToken ct)
    {
        var safePalletHeight = request.PalletHeight <= 0 ? 1.5m : request.PalletHeight;

        var warehouses = await _db.Warehouses
            .AsNoTracking()
            .Include(w => w.Zones)
                .ThenInclude(z => z.Locations)
                    .ThenInclude(l => l.StorageType)
            .ToListAsync(ct);

        var dtos = warehouses.Select(w =>
        {
            int totalBase = 0;
            int totalEst = 0;

            foreach (var z in w.Zones)
            {
                foreach (var l in z.Locations)
                {
                    totalBase += l.BaseCapacity;
                    int locMax = l.BaseCapacity;
                    if (l.StorageType.CapacityStrategy == Enums.StorageCapacityStrategy.DynamicStacking)
                    {
                        var maxStacking = (int)Math.Max(1, Math.Floor(w.ClearanceHeight / safePalletHeight));
                        locMax = l.BaseCapacity * maxStacking;
                    }
                    totalEst += locMax;
                }
            }

            return new WarehouseDto(w.Id, w.Code, w.Name, w.ClearanceHeight, w.IsActive, totalBase, totalEst);
        }).OrderBy(w => w.Code).ToList();

        return Results.Ok(dtos);
    }
}

public class DeleteWarehouseHandler : IRequestHandler<DeleteWarehouseCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteWarehouseHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteWarehouseCommand request, CancellationToken ct)
    {
        var warehouse = await _db.Warehouses.FindAsync(new object[] { request.Id }, ct);
        if (warehouse == null) return Results.NotFound();

        try
        {
            _db.Warehouses.Remove(warehouse);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir este pavilhão pois existem Zonas/Corredores cadastrados dentro dele." });
        }

        return Results.NoContent();
    }
}

// ==============================================================================
// 4. ENDPOINTS
// ==============================================================================

public static class WarehouseEndpoints
{
    public static void MapWarehouseEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/topology/warehouses").WithTags("Topology").RequireAuthorization();

        group.MapPost("/", async (CreateWarehouseCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
        group.MapPut("/{id:guid}", async (Guid id, UpdateWarehouseCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        // Recebe do Front a altura de simulação via Query Parameter
        group.MapGet("/", async ([FromQuery] decimal? palletHeight, IMediator mediator) => await mediator.Send(new ListWarehousesQuery(palletHeight ?? 1.5m))).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteWarehouseCommand(id))).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
    }
}