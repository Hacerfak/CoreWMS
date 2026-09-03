using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Topology.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Topology;

// ==============================================================================
// 1. DTOs & CONTRATOS
// ==============================================================================
public record StorageTypeDto(Guid Id, string Name, bool IsVirtual, bool AllowMixedProducts, bool AllowMixedBatches, int CapacityStrategy, bool IsActive);

public record CreateStorageTypeCommand(string Name, bool IsVirtual, bool AllowMixedProducts, bool AllowMixedBatches, int CapacityStrategy) : IRequest<IResult>;
public record UpdateStorageTypeCommand(Guid Id, string Name, bool IsVirtual, bool AllowMixedProducts, bool AllowMixedBatches, int CapacityStrategy) : IRequest<IResult>;
public record DeleteStorageTypeCommand(Guid Id) : IRequest<IResult>;
public record ListStorageTypesQuery() : IRequest<IResult>;

// ==============================================================================
// 2. VALIDADORES
// ==============================================================================
public class CreateStorageTypeCommandValidator : AbstractValidator<CreateStorageTypeCommand>
{
    public CreateStorageTypeCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CapacityStrategy).Must(x => Enum.IsDefined(typeof(StorageCapacityStrategy), x))
            .WithMessage("Estratégia de capacidade inválida.");
    }
}

public class UpdateStorageTypeCommandValidator : AbstractValidator<UpdateStorageTypeCommand>
{
    public UpdateStorageTypeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CapacityStrategy).Must(x => Enum.IsDefined(typeof(StorageCapacityStrategy), x))
            .WithMessage("Estratégia de capacidade inválida.");
    }
}

// ==============================================================================
// 3. HANDLERS
// ==============================================================================
public class CreateStorageTypeHandler : IRequestHandler<CreateStorageTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateStorageTypeHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateStorageTypeCommand request, CancellationToken ct)
    {
        if (await _db.StorageTypes.AnyAsync(s => s.Name.ToLower() == request.Name.ToLower(), ct))
            return Results.BadRequest(new { Message = "Já existe um Tipo de Armazenamento com este nome." });

        var storageType = new StorageType(request.Name, request.IsVirtual, request.AllowMixedProducts, request.AllowMixedBatches, (StorageCapacityStrategy)request.CapacityStrategy);

        _db.StorageTypes.Add(storageType);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/topology/storage-types/{storageType.Id}", storageType.Adapt<StorageTypeDto>());
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

        storageType.Update(request.Name, request.IsVirtual, request.AllowMixedProducts, request.AllowMixedBatches, (StorageCapacityStrategy)request.CapacityStrategy);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public class ListStorageTypesHandler : IRequestHandler<ListStorageTypesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListStorageTypesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListStorageTypesQuery request, CancellationToken ct)
    {
        var types = await _db.StorageTypes.AsNoTracking().ProjectToType<StorageTypeDto>().ToListAsync(ct);
        return Results.Ok(types);
    }
}

public class DeleteStorageTypeHandler : IRequestHandler<DeleteStorageTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteStorageTypeHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteStorageTypeCommand request, CancellationToken ct)
    {
        var storageType = await _db.StorageTypes.FindAsync(new object[] { request.Id }, ct);
        if (storageType == null) return Results.NotFound();

        // Bloqueio de segurança: não pode apagar se existirem endereços atrelados
        if (await _db.Locations.AnyAsync(l => l.StorageTypeId == request.Id, ct))
            return Results.BadRequest(new { Message = "Não é possível excluir este Tipo pois existem endereços físicos atrelados a ele." });

        _db.StorageTypes.Remove(storageType);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

// ==============================================================================
// 4. ENDPOINTS
// ==============================================================================
public static class StorageTypeEndpoints
{
    public static void MapStorageTypeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/topology/storage-types").WithTags("Topology").RequireAuthorization();

        group.MapPost("/", async (CreateStorageTypeCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission("topology:manage");
        group.MapPut("/{id:guid}", async (Guid id, UpdateStorageTypeCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission("topology:manage");
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListStorageTypesQuery())).RequirePermission("topology:manage");
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteStorageTypeCommand(id))).RequirePermission("topology:manage");
    }
}