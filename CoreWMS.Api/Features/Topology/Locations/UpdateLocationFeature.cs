using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Locations;

public record UpdateLocationCommand(Guid Id, Guid StorageTypeId, int BaseCapacity, bool IsActive) : IRequest<IResult>;

public class UpdateLocationCommandValidator : AbstractValidator<UpdateLocationCommand>
{
    public UpdateLocationCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.StorageTypeId).NotEmpty();
        RuleFor(x => x.BaseCapacity).GreaterThan(0);
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

public static class UpdateLocationEndpoints
{
    public static void MapUpdateLocationEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/topology/locations/{id:guid}", async (Guid id, UpdateLocationCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}