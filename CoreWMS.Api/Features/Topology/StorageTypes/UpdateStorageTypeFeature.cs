using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology.StorageTypes;

public record UpdateStorageTypeCommand(Guid Id, string Name, int Role, bool AllowMixedProducts, bool AllowMixedBatches, int CapacityStrategy) : IRequest<IResult>;

public class UpdateStorageTypeCommandValidator : AbstractValidator<UpdateStorageTypeCommand>
{
    public UpdateStorageTypeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Role).Must(x => Enum.IsDefined(typeof(StorageRole), x)).WithMessage("Finalidade (Role) inválida.");
        RuleFor(x => x.CapacityStrategy).Must(x => Enum.IsDefined(typeof(StorageCapacityStrategy), x)).WithMessage("Estratégia de capacidade inválida.");
    }
}

public class UpdateStorageTypeHandler : IRequestHandler<UpdateStorageTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateStorageTypeHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateStorageTypeCommand request, CancellationToken ct)
    {
        var storageType = await _db.StorageTypes.FindAsync(new object[] { request.Id }, ct);
        if (storageType == null) return Results.NotFound(new { Message = "Tipo de Armazenamento não encontrado." });

        if (await _db.StorageTypes.AnyAsync(s => s.Name.ToLower() == request.Name.ToLower() && s.Id != request.Id, ct))
            return Results.BadRequest(new { Message = "Já existe outro Tipo de Armazenamento com este nome." });

        storageType.Update(request.Name, (StorageRole)request.Role, request.AllowMixedProducts, request.AllowMixedBatches, (StorageCapacityStrategy)request.CapacityStrategy);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class UpdateStorageTypeEndpoints
{
    public static void MapUpdateStorageTypeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/topology/storage-types/{id:guid}", async (Guid id, UpdateStorageTypeCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}