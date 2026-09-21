using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Zones;

public record CreateZoneCommand(Guid WarehouseId, string Code, string Name) : IRequest<IResult>;

public class CreateZoneCommandValidator : AbstractValidator<CreateZoneCommand>
{
    public CreateZoneCommandValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
    }
}

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

public static class CreateZoneEndpoints
{
    public static void MapCreateZoneEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/topology/zones", async (CreateZoneCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}