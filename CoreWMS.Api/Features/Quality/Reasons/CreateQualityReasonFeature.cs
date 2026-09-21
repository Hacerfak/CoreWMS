using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Quality.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Reasons;

public record CreateQualityReasonCommand(string Code, string Description) : IRequest<IResult>;

public class CreateQualityReasonCommandValidator : AbstractValidator<CreateQualityReasonCommand>
{
    public CreateQualityReasonCommandValidator()
    {
        RuleFor(x => x.Code).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Description).NotEmpty().MaximumLength(150);
    }
}

public class CreateQualityReasonHandler : IRequestHandler<CreateQualityReasonCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateQualityReasonHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateQualityReasonCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (await _db.QualityReasons.AnyAsync(r => r.CompanyId == companyId && r.Code == request.Code, ct))
            return Results.BadRequest(new { Message = "Código de motivo já existe." });

        var reason = new QualityReason(companyId, request.Code, request.Description);

        _db.QualityReasons.Add(reason);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { reason.Id });
    }
}

public static class CreateQualityReasonEndpoints
{
    public static void MapCreateQualityReasonEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/quality/reasons", async (CreateQualityReasonCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}