using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.StorageTypes;

public record CreateStorageTypeCommand(string Name, int Role, bool AllowMixedProducts, bool AllowMixedBatches, int CapacityStrategy) : IRequest<IResult>;

public class CreateStorageTypeCommandValidator : AbstractValidator<CreateStorageTypeCommand>
{
    public CreateStorageTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role).Must(x => Enum.IsDefined(typeof(StorageRole), x)).WithMessage("Finalidade (Role) inválida.");
        RuleFor(x => x.CapacityStrategy).Must(x => Enum.IsDefined(typeof(StorageCapacityStrategy), x)).WithMessage("Estratégia de capacidade inválida.");
    }
}

public class CreateStorageTypeHandler : IRequestHandler<CreateStorageTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateStorageTypeHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateStorageTypeCommand request, CancellationToken ct)
    {
        if (await _db.StorageTypes.AnyAsync(s => s.Name.ToLower() == request.Name.ToLower(), ct))
            return Results.BadRequest(new { Message = "Já existe um Tipo de Armazenamento com este nome." });

        var storageType = new StorageType(request.Name, (StorageRole)request.Role, request.AllowMixedProducts, request.AllowMixedBatches, (StorageCapacityStrategy)request.CapacityStrategy);

        _db.StorageTypes.Add(storageType);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/topology/storage-types/{storageType.Id}", storageType.Adapt<StorageTypeDto>());
    }
}

public static class CreateStorageTypeEndpoints
{
    public static void MapCreateStorageTypeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/topology/storage-types", async (CreateStorageTypeCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}