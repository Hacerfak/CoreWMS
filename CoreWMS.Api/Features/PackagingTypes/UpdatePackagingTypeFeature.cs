using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.PackagingTypes;

public record UpdatePackagingTypeCommand(Guid Id, string Description, bool IsActive) : IRequest<IResult>;

public class UpdatePackagingTypeCommandValidator : AbstractValidator<UpdatePackagingTypeCommand>
{
    public UpdatePackagingTypeCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Description).NotEmpty().MaximumLength(150);
    }
}

public class UpdatePackagingTypeHandler : IRequestHandler<UpdatePackagingTypeCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdatePackagingTypeHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdatePackagingTypeCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var pt = await _db.PackagingTypes.FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (pt == null) return Results.NotFound();

        pt.Update(request.Description, request.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class UpdatePackagingTypeEndpoints
{
    public static void MapUpdatePackagingTypeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/packaging-types/{id:guid}", async (Guid id, UpdatePackagingTypeCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("PackagingTypes")
           .RequireAuthorization()
           .RequirePermission(Permissions.Packing.Manage);
    }
}