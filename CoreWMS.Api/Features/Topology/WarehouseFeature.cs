using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology;

// ==============================================================================
// 1. DTOs & CONTRATOS
// ==============================================================================
public record WarehouseDto(Guid Id, string Code, string Name, decimal ClearanceHeight, bool IsActive);

public record CreateWarehouseCommand(string Code, string Name, decimal ClearanceHeight) : IRequest<IResult>;
public record UpdateWarehouseCommand(Guid Id, string Name, decimal ClearanceHeight) : IRequest<IResult>;
public record DeleteWarehouseCommand(Guid Id) : IRequest<IResult>;
public record ListWarehousesQuery() : IRequest<IResult>;

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

        return Results.Created($"/api/topology/warehouses/{warehouse.Id}", warehouse.Adapt<WarehouseDto>());
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

public class ListWarehousesHandler : IRequestHandler<ListWarehousesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListWarehousesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListWarehousesQuery request, CancellationToken ct)
    {
        var warehouses = await _db.Warehouses.AsNoTracking().ProjectToType<WarehouseDto>().ToListAsync(ct);
        return Results.Ok(warehouses);
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

        // O mapeamento OnModelCreating possui OnDelete(DeleteBehavior.Restrict) na tabela de Zones. 
        // O banco travará a exclusão caso o armazém não esteja vazio.
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

        group.MapPost("/", async (CreateWarehouseCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission("topology:manage");
        group.MapPut("/{id:guid}", async (Guid id, UpdateWarehouseCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission("topology:manage");
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListWarehousesQuery())).RequirePermission("topology:manage");
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteWarehouseCommand(id))).RequirePermission("topology:manage");
    }
}