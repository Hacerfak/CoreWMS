using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.Warehouses;

public record CreateWarehouseCommand(string Code, string Name, decimal ClearanceHeight) : IRequest<IResult>;

public class CreateWarehouseCommandValidator : AbstractValidator<CreateWarehouseCommand>
{
    public CreateWarehouseCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
        RuleFor(x => x.ClearanceHeight).GreaterThan(0).WithMessage("O pé direito deve ser maior que zero.");
    }
}

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

        // Retorna o DTO com capacidades zeradas pois acabou de ser criado
        return Results.Created($"/api/topology/warehouses/{warehouse.Id}",
            new WarehouseDto(warehouse.Id, warehouse.Code, warehouse.Name, warehouse.ClearanceHeight, warehouse.IsActive, 0, 0));
    }
}

public static class CreateWarehouseEndpoints
{
    public static void MapCreateWarehouseEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/topology/warehouses", async (CreateWarehouseCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}