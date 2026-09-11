using System.Text;
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

public record LocationDto(Guid Id, Guid ZoneId, Guid StorageTypeId, string StorageTypeName, string Code, string FullPath, int BaseCapacity, bool IsActive, int MaxCapacity, decimal ClearanceHeight);

public record CreateLocationCommand(Guid ZoneId, Guid StorageTypeId, string Code, int BaseCapacity) : IRequest<IResult>;
public record UpdateLocationCommand(Guid Id, Guid StorageTypeId, int BaseCapacity, bool IsActive) : IRequest<IResult>;
public record DeleteLocationCommand(Guid Id) : IRequest<IResult>;

// NOVO: Adicionado o parâmetro PalletHeight para o cálculo dinâmico
public record ListLocationsQuery(Guid ZoneId, decimal PalletHeight) : IRequest<IResult>;

public record ListDockLocationsQuery() : IRequest<IResult>;
public record ListStorageLocationsQuery() : IRequest<IResult>;
public record DownloadLocationTemplateQuery() : IRequest<IResult>;
public record ImportLocationsCommand(byte[] FileBytes) : IRequest<IResult>;

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
        if (!await _db.StorageTypes.AnyAsync(s => s.Id == request.StorageTypeId, ct))
            return Results.BadRequest(new { Message = "Tipo de Armazenamento não encontrado." });

        var zone = await _db.Zones.Include(z => z.Warehouse).FirstOrDefaultAsync(z => z.Id == request.ZoneId, ct);
        if (zone == null) return Results.NotFound(new { Message = "Zona não encontrada." });

        var fullPath = $"{zone.Warehouse.Code}{zone.Code}{request.Code.Trim().ToUpper()}";

        if (await _db.Locations.AnyAsync(l => l.FullPath == fullPath, ct))
            return Results.BadRequest(new { Message = $"O endereço '{fullPath}' já está em uso." });

        var location = new Location(request.ZoneId, request.StorageTypeId, request.Code, fullPath, request.BaseCapacity);
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
            .Include(l => l.Zone).ThenInclude(z => z.Warehouse)
            .Where(l => l.ZoneId == request.ZoneId)
            .ToListAsync(ct);

        // Previne divisão por zero caso enviem altura incorreta
        var safePalletHeight = request.PalletHeight <= 0 ? 1.5m : request.PalletHeight;

        var dtos = locations.Select(loc =>
        {
            var clearance = loc.Zone.Warehouse.ClearanceHeight;
            int maxCapacity = loc.BaseCapacity;

            if (loc.StorageType.CapacityStrategy == Enums.StorageCapacityStrategy.DynamicStacking)
            {
                var maxStacking = (int)Math.Max(1, Math.Floor(clearance / safePalletHeight));
                maxCapacity = loc.BaseCapacity * maxStacking;
            }

            return new LocationDto(
                loc.Id, loc.ZoneId, loc.StorageTypeId, loc.StorageType.Name,
                loc.Code, loc.FullPath, loc.BaseCapacity, loc.IsActive,
                maxCapacity, clearance);
        }).OrderBy(l => l.FullPath).ToList();

        return Results.Ok(dtos);
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

        try
        {
            _db.Locations.Remove(location);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir este endereço pois existem operações atreladas a ele. Sugerimos Inativá-lo." });
        }

        return Results.NoContent();
    }
}

public class ListDockLocationsHandler : IRequestHandler<ListDockLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListDockLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListDockLocationsQuery request, CancellationToken ct)
    {
        var docks = await _db.Locations.AsNoTracking().Include(l => l.StorageType)
            .Where(l => l.StorageType.Role == Enums.StorageRole.Dock && l.IsActive)
            .Select(l => new { l.Id, l.FullPath, l.BaseCapacity }).ToListAsync(ct);
        return Results.Ok(docks);
    }
}

public class ListStorageLocationsHandler : IRequestHandler<ListStorageLocationsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListStorageLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListStorageLocationsQuery request, CancellationToken ct)
    {
        var locs = await _db.Locations.AsNoTracking().Include(l => l.StorageType)
            .Where(l => l.StorageType.Role == Enums.StorageRole.Storage && l.IsActive)
            .Select(l => new { l.Id, l.FullPath, l.BaseCapacity })
            .OrderBy(l => l.FullPath).ToListAsync(ct);
        return Results.Ok(locs);
    }
}

public class DownloadLocationTemplateHandler : IRequestHandler<DownloadLocationTemplateQuery, IResult>
{
    public Task<IResult> Handle(DownloadLocationTemplateQuery request, CancellationToken ct)
    {
        var csv = "Armazem_Codigo;Zona_Codigo;Posicao_Codigo;TipoArmazenagem_Nome;Capacidade\n" +
                  "P1;C1;B01;Blocado Padrão;10\n" +
                  "P1;C1;B02;Porta-Pallet Frio;1";

        var bytes = Encoding.UTF8.GetBytes(csv);
        return Task.FromResult(Results.File(bytes, "text/csv", "Modelo_Importacao_Enderecos.csv"));
    }
}

public class ImportLocationsHandler : IRequestHandler<ImportLocationsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public ImportLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ImportLocationsCommand request, CancellationToken ct)
    {
        var content = Encoding.UTF8.GetString(request.FileBytes);
        var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);

        if (lines.Length <= 1) return Results.BadRequest(new { Message = "O arquivo está vazio ou contém apenas o cabeçalho." });

        var warehouses = await _db.Warehouses.AsNoTracking().ToDictionaryAsync(w => w.Code.ToUpper(), w => w.Id, ct);
        var zones = await _db.Zones.AsNoTracking().ToListAsync(ct);
        var storageTypes = await _db.StorageTypes.AsNoTracking().ToDictionaryAsync(s => s.Name.ToUpper(), s => s.Id, ct);
        var existingLocations = await _db.Locations.ToListAsync(ct);

        int inserted = 0;
        int updated = 0;
        var errors = new List<string>();
        var newLocations = new List<Location>();

        for (int i = 1; i < lines.Length; i++)
        {
            var line = lines[i];
            var cols = line.Split(';');

            if (cols.Length < 5)
            {
                errors.Add($"Linha {i + 1}: Formato inválido. Esperado 5 colunas separadas por ';'.");
                continue;
            }

            var whCode = cols[0].Trim().ToUpper();
            var znCode = cols[1].Trim().ToUpper();
            var locCode = cols[2].Trim().ToUpper();
            var typeName = cols[3].Trim().ToUpper();
            var capacityStr = cols[4].Trim();

            if (!int.TryParse(capacityStr, out var capacity) || capacity <= 0)
            {
                errors.Add($"Linha {i + 1}: Capacidade deve ser um número maior que zero.");
                continue;
            }

            if (!warehouses.TryGetValue(whCode, out var warehouseId))
            {
                errors.Add($"Linha {i + 1}: Armazém '{whCode}' não existe no sistema.");
                continue;
            }

            var zone = zones.FirstOrDefault(z => z.WarehouseId == warehouseId && z.Code.ToUpper() == znCode);
            if (zone == null)
            {
                errors.Add($"Linha {i + 1}: Zona '{znCode}' não encontrada dentro do armazém '{whCode}'.");
                continue;
            }

            if (!storageTypes.TryGetValue(typeName, out var storageTypeId))
            {
                errors.Add($"Linha {i + 1}: Tipo de Armazenamento '{typeName}' não encontrado.");
                continue;
            }

            var fullPath = $"{whCode}{znCode}{locCode}";

            if (newLocations.Any(l => l.FullPath == fullPath))
            {
                errors.Add($"Linha {i + 1}: O endereço '{fullPath}' está duplicado dentro desta mesma planilha.");
                continue;
            }

            var existing = existingLocations.FirstOrDefault(l => l.FullPath == fullPath);
            if (existing != null)
            {
                existing.Update(storageTypeId, capacity, true);
                updated++;
            }
            else
            {
                var loc = new Location(zone.Id, storageTypeId, locCode, fullPath, capacity);
                newLocations.Add(loc);
                inserted++;
            }
        }

        if (newLocations.Any())
            _db.Locations.AddRange(newLocations);

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Processamento concluído. {inserted} criados, {updated} atualizados, {errors.Count} falhas.",
            Inserted = inserted,
            Updated = updated,
            Errors = errors
        });
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

        group.MapPost("/", async (CreateLocationCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
        group.MapPut("/{id:guid}", async (Guid id, UpdateLocationCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteLocationCommand(id))).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        // NOVO: Adicionado [FromQuery] para o PalletHeight com default 1.5m
        group.MapGet("/{zoneId:guid}", async (Guid zoneId, [FromQuery] decimal? palletHeight, IMediator mediator) =>
            await mediator.Send(new ListLocationsQuery(zoneId, palletHeight ?? 1.5m))).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        group.MapGet("/docks", async (IMediator mediator) => await mediator.Send(new ListDockLocationsQuery())).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
        group.MapGet("/storage", async (IMediator mediator) => await mediator.Send(new ListStorageLocationsQuery())).RequirePermission(Identity.Constants.Permissions.Topology.Manage);

        group.MapGet("/template", async (IMediator mediator) => await mediator.Send(new DownloadLocationTemplateQuery())).RequirePermission(Identity.Constants.Permissions.Topology.Manage);
        group.MapPost("/import", async (IFormFile file, IMediator mediator) =>
        {
            if (file == null || file.Length == 0) return Results.BadRequest(new { Message = "Arquivo obrigatório." });
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            return await mediator.Send(new ImportLocationsCommand(ms.ToArray()));
        }).RequirePermission(Identity.Constants.Permissions.Topology.Manage).DisableAntiforgery();
    }
}