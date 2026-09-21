using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record CreateLocationCommand(Guid ZoneId, Guid StorageTypeId, string Code, int BaseCapacity) : IRequest<IResult>;

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

public static class CreateLocationEndpoints
{
    public static void MapCreateLocationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/topology/locations", async (CreateLocationCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}