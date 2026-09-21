using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Topology.Zones;

public record UpdateZoneCommand(Guid Id, string Name) : IRequest<IResult>;

public class UpdateZoneCommandValidator : AbstractValidator<UpdateZoneCommand>
{
    public UpdateZoneCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
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

public static class UpdateZoneEndpoints
{
    public static void MapUpdateZoneEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/topology/zones/{id:guid}", async (Guid id, UpdateZoneCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}