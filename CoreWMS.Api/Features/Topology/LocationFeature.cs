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
public record LocationDto(Guid Id, Guid ZoneId, Guid StorageTypeId, string StorageTypeName, string Code, string FullPath, string? Aisle, string? Building, string? Level, string? Slot, int BaseCapacity, bool IsActive);

public record CreateLocationCommand(Guid ZoneId, Guid StorageTypeId, string Code, int BaseCapacity, string? Aisle, string? Building, string? Level, string? Slot) : IRequest<IResult>;
public record UpdateLocationCommand(Guid Id, Guid StorageTypeId, int BaseCapacity, bool IsActive) : IRequest<IResult>;
public record DeleteLocationCommand(Guid Id) : IRequest<IResult>;
public record ListLocationsQuery(Guid ZoneId) : IRequest<IResult>;

// ==============================================================================
// 2. VALIDADORES
// ==============================================================================
public class CreateLocationCommandValidator : AbstractValidator<CreateLocationCommand>
{
    public CreateLocationCommandValidator()
    {
        RuleFor(x => x.ZoneId).NotEmpty();
        RuleFor(x => x.StorageTypeId).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(50);
        RuleFor(x => x.BaseCapacity).GreaterThan(0).WithMessage("A capacidade base deve ser no mínimo 1.");
    }
}

public class UpdateLocationCommandValidator : AbstractValidator<UpdateLocationCommand>
{
    public UpdateLocationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.StorageTypeId).NotEmpty();
        RuleFor(x => x.BaseCapacity).GreaterThan(0);
    }
}

// ==============================================================================
// 3. HANDLERS
// ==============================================================================
public class CreateLocationHandler : IRequestHandler<CreateLocationCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateLocationHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateLocationCommand request, CancellationToken ct)
    {
        // 1. Valida Tipos
        if (!await _db.StorageTypes.AnyAsync(s => s.Id == request.StorageTypeId, ct))
            return Results.BadRequest(new { Message = "Tipo de Armazenamento não encontrado." });

        // 2. Busca a Zona e carrega o Armazém junto para montar o FullPath
        var zone = await _db.Zones.Include(z => z.Warehouse).FirstOrDefaultAsync(z => z.Id == request.ZoneId, ct);
        if (zone == null)
            return Results.NotFound(new { Message = "Zona/Corredor não encontrado." });

        // 3. Monta o Caminho Completo
        var fullPath = $"{zone.Warehouse.Code}-{zone.Code}-{request.Code.Trim().ToUpper()}";

        // 4. Valida unicidade global do FullPath (Não podem existir 2 endereços iguais em toda a topologia)
        if (await _db.Locations.AnyAsync(l => l.FullPath == fullPath, ct))
            return Results.BadRequest(new { Message = $"O endereço completo '{fullPath}' já está em uso." });

        var location = new Location(request.ZoneId, request.StorageTypeId, request.Code, fullPath, request.BaseCapacity, request.Aisle, request.Building, request.Level, request.Slot);

        _db.Locations.Add(location);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/topology/locations/{location.Id}", new { location.Id, location.FullPath });
    }
}

public class UpdateLocationHandler : IRequestHandler<UpdateLocationCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateLocationHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateLocationCommand request, CancellationToken ct)
    {
        var location = await _db.Locations.FindAsync(new object[] { request.Id }, ct);
        if (location == null) return Results.NotFound(new { Message = "Endereço não encontrado." });

        if (!await _db.StorageTypes.AnyAsync(s => s.Id == request.StorageTypeId, ct))
            return Results.BadRequest(new { Message = "Tipo de Armazenamento não encontrado." });

        // Nota: O código físico (FullPath) NÃO é alterado aqui. Se o endereço físico mudar, ele deve ser inativado/removido e recriado.
        location.Update(request.StorageTypeId, request.BaseCapacity, request.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public class ListLocationsHandler : IRequestHandler<ListLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListLocationsQuery request, CancellationToken ct)
    {
        var locations = await _db.Locations
            .AsNoTracking()
            .Include(l => l.StorageType)
            .Where(l => l.ZoneId == request.ZoneId)
            .Select(l => new LocationDto(
                l.Id, l.ZoneId, l.StorageTypeId, l.StorageType.Name, l.Code, l.FullPath,
                l.Aisle, l.Building, l.Level, l.Slot, l.BaseCapacity, l.IsActive))
            .ToListAsync(ct);

        return Results.Ok(locations);
    }
}

public class DeleteLocationHandler : IRequestHandler<DeleteLocationCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteLocationHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteLocationCommand request, CancellationToken ct)
    {
        var location = await _db.Locations.FindAsync(new object[] { request.Id }, ct);
        if (location == null) return Results.NotFound();

        // O Entity Framework tentará apagar. Caso existam estoques vinculados no futuro, 
        // a restrição de banco (FK) lançará uma DbUpdateException.
        try
        {
            _db.Locations.Remove(location);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir este endereço pois existem operações ou estoques atrelados a ele. Sugerimos Inativá-lo." });
        }

        return Results.NoContent();
    }
}

// ==============================================================================
// 4. ENDPOINTS
// ==============================================================================
public static class LocationEndpoints
{
    public static void MapLocationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/topology/locations").WithTags("Topology").RequireAuthorization();

        group.MapPost("/", async (CreateLocationCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission("topology:manage");
        group.MapPut("/{id:guid}", async (Guid id, UpdateLocationCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission("topology:manage");
        group.MapGet("/{zoneId:guid}", async (Guid zoneId, IMediator mediator) => await mediator.Send(new ListLocationsQuery(zoneId))).RequirePermission("topology:manage");
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteLocationCommand(id))).RequirePermission("topology:manage");
    }
}