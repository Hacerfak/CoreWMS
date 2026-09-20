using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.PackagingTypes;

public record CreatePackagingTypeCommand(string Code, string Description) : IRequest<IResult>;

public class CreatePackagingTypeCommandValidator : AbstractValidator<CreatePackagingTypeCommand>
{
    public CreatePackagingTypeCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(150);
    }
}

public class CreatePackagingTypeHandler : IRequestHandler<CreatePackagingTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreatePackagingTypeHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreatePackagingTypeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (await _db.PackagingTypes.AnyAsync(p => p.CompanyId == companyId && p.Code.ToUpper() == request.Code.ToUpper(), ct))
            return Results.BadRequest(new { Message = "Já existe um Tipo de Embalagem com este código para esta Empresa." });

        var packagingType = new PackagingType(companyId, request.Code, request.Description);

        _db.PackagingTypes.Add(packagingType);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/packaging-types/{packagingType.Id}", packagingType.Adapt<PackagingTypeDto>());
    }
}

public static class CreatePackagingTypeEndpoints
{
    public static void MapCreatePackagingTypeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/packaging-types", async (CreatePackagingTypeCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("PackagingTypes")
           .RequireAuthorization()
           .RequirePermission(Permissions.Packing.Manage); // Pode criar uma permissão global específica depois
    }
}