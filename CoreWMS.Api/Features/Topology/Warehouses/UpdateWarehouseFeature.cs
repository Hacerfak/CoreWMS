using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Topology.Warehouses;

public record UpdateWarehouseCommand(Guid Id, string Name, decimal ClearanceHeight) : IRequest<IResult>;

public class UpdateWarehouseCommandValidator : AbstractValidator<UpdateWarehouseCommand>
{
    public UpdateWarehouseCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ClearanceHeight).GreaterThan(0);
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

public static class UpdateWarehouseEndpoints
{
    public static void MapUpdateWarehouseEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/topology/warehouses/{id:guid}", async (Guid id, UpdateWarehouseCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}