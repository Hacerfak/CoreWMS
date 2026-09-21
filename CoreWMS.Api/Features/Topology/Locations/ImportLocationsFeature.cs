using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record ImportLocationsCommand(byte[] FileBytes) : IRequest<IResult>;

public class ImportLocationsHandler : IRequestHandler<ImportLocationsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public ImportLocationsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ImportLocationsCommand request, CancellationToken ct)
    {
        var content = Encoding.UTF8.GetString(request.FileBytes);
        var lines = content.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.RemoveEmptyEntries);

        if (lines.Length <= 1)
            return Results.BadRequest(new { Message = "O arquivo está vazio ou contém apenas o cabeçalho." });

        var warehouses = await _db.Warehouses.AsNoTracking().ToDictionaryAsync(w => w.Code.ToUpper(), w => w.Id, ct);
        var zones = await _db.Zones.AsNoTracking().ToListAsync(ct);
        var storageTypes = await _db.StorageTypes.AsNoTracking().ToDictionaryAsync(s => s.Name.ToUpper(), s => s.Id, ct);

        // Previne OutOfMemory: Busca no banco apenas os endereços que vieram no arquivo
        var targetPaths = new HashSet<string>();
        foreach (var line in lines.Skip(1))
        {
            var cols = line.Split(';');
            if (cols.Length >= 3)
            {
                var fullPath = $"{cols[0].Trim().ToUpper()}{cols[1].Trim().ToUpper()}{cols[2].Trim().ToUpper()}";
                targetPaths.Add(fullPath);
            }
        }

        var existingLocations = await _db.Locations
            .Where(l => targetPaths.Contains(l.FullPath))
            .ToListAsync(ct);

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
                errors.Add($"Linha {i + 1}: Formato inválido.");
                continue;
            }

            var whCode = cols[0].Trim().ToUpper();
            var znCode = cols[1].Trim().ToUpper();
            var locCode = cols[2].Trim().ToUpper();
            var typeName = cols[3].Trim().ToUpper();
            var capacityStr = cols[4].Trim();

            if (!int.TryParse(capacityStr, out var capacity) || capacity <= 0)
            {
                errors.Add($"Linha {i + 1}: Capacidade inválida.");
                continue;
            }

            if (!warehouses.TryGetValue(whCode, out var warehouseId))
            {
                errors.Add($"Linha {i + 1}: Armazém '{whCode}' não existe.");
                continue;
            }

            var zone = zones.FirstOrDefault(z => z.WarehouseId == warehouseId && z.Code.ToUpper() == znCode);
            if (zone == null)
            {
                errors.Add($"Linha {i + 1}: Zona '{znCode}' não encontrada.");
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
                errors.Add($"Linha {i + 1}: O endereço '{fullPath}' está duplicado na planilha.");
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

        if (newLocations.Any()) _db.Locations.AddRange(newLocations);
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

public static class ImportLocationsEndpoints
{
    public static void MapImportLocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/topology/locations/import", async (IFormFile file, IMediator mediator) =>
        {
            if (file == null || file.Length == 0) return Results.BadRequest(new { Message = "Arquivo obrigatório." });
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            return await mediator.Send(new ImportLocationsCommand(ms.ToArray()));
        })
        .WithTags("Topology")
        .RequireAuthorization()
        .RequirePermission(Permissions.Topology.Manage)
        .DisableAntiforgery();
    }
}