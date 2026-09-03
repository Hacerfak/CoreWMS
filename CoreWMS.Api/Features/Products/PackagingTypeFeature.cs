using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

// ==========================================
// 1. DTOs & CONTRATOS
// ==========================================
public record PackagingTypeDto(Guid Id, string Code, string Description, bool IsActive);

public record CreatePackagingTypeCommand(string Code, string Description) : IRequest<IResult>;
public record UpdatePackagingTypeCommand(Guid Id, string Description, bool IsActive) : IRequest<IResult>;
public record DeletePackagingTypeCommand(Guid Id) : IRequest<IResult>;
public record ListPackagingTypesQuery() : IRequest<IResult>;

// ==========================================
// 2. VALIDADORES
// ==========================================
public class CreatePackagingTypeCommandValidator : AbstractValidator<CreatePackagingTypeCommand>
{
    public CreatePackagingTypeCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(150);
    }
}

public class UpdatePackagingTypeCommandValidator : AbstractValidator<UpdatePackagingTypeCommand>
{
    public UpdatePackagingTypeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Description).NotEmpty().MaximumLength(150);
    }
}

// ==========================================
// 3. HANDLERS
// ==========================================
public class CreatePackagingTypeHandler : IRequestHandler<CreatePackagingTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public CreatePackagingTypeHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(CreatePackagingTypeCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        if (await _db.PackagingTypes.AnyAsync(p => p.CompanyId == companyId && p.Code.ToUpper() == request.Code.ToUpper(), ct))
            return Results.BadRequest(new { Message = "Já existe um Tipo de Embalagem com este código para esta Empresa." });

        var packagingType = new PackagingType(companyId, request.Code, request.Description);
        _db.PackagingTypes.Add(packagingType);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/products/packaging-types/{packagingType.Id}", packagingType.Adapt<PackagingTypeDto>());
    }
}

public class UpdatePackagingTypeHandler : IRequestHandler<UpdatePackagingTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public UpdatePackagingTypeHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(UpdatePackagingTypeCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var pt = await _db.PackagingTypes.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);
        if (pt == null) return Results.NotFound();

        pt.Update(request.Description, request.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public class ListPackagingTypesHandler : IRequestHandler<ListPackagingTypesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public ListPackagingTypesHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(ListPackagingTypesQuery request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var list = await _db.PackagingTypes
            .Where(p => p.CompanyId == companyId)
            .AsNoTracking()
            .ProjectToType<PackagingTypeDto>()
            .ToListAsync(ct);

        return Results.Ok(list);
    }
}

public class DeletePackagingTypeHandler : IRequestHandler<DeletePackagingTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;

    public DeletePackagingTypeHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(DeletePackagingTypeCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId))
            return Results.BadRequest(new { Message = "X-Company-Id obrigatório." });

        var pt = await _db.PackagingTypes.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);
        if (pt == null) return Results.NotFound();

        try
        {
            _db.PackagingTypes.Remove(pt);
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            return Results.BadRequest(new { Message = "Não é possível excluir, pois já existem produtos utilizando esta embalagem." });
        }

        return Results.NoContent();
    }
}

// ==========================================
// 4. ENDPOINTS
// ==========================================
public static class PackagingTypeEndpoints
{
    public static void MapPackagingTypeEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/products/packaging-types").WithTags("Products").RequireAuthorization();

        group.MapPost("/", async (CreatePackagingTypeCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Products.Create);
        group.MapPut("/{id:guid}", async (Guid id, UpdatePackagingTypeCommand cmd, IMediator mediator) => await mediator.Send(cmd with { Id = id })).RequirePermission(Permissions.Products.Edit);
        group.MapGet("/", async (IMediator mediator) => await mediator.Send(new ListPackagingTypesQuery())).RequirePermission(Permissions.Products.View);
        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeletePackagingTypeCommand(id))).RequirePermission(Permissions.Products.Delete);
    }
}