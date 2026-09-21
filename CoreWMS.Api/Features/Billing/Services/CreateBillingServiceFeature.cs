using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Billing.Services;

public record CreateBillingServiceCommand(string Name, BillingServiceType Type, string? SqlTemplate) : IRequest<IResult>;

public class CreateBillingServiceCommandValidator : AbstractValidator<CreateBillingServiceCommand>
{
    public CreateBillingServiceCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
    }
}

public class CreateBillingServiceHandler : IRequestHandler<CreateBillingServiceCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CreateBillingServiceHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CreateBillingServiceCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (request.Type == BillingServiceType.Automatic_SQL && string.IsNullOrWhiteSpace(request.SqlTemplate))
            return Results.BadRequest(new { Message = "Serviços automáticos exigem uma query SQL." });

        var service = new BillingService(companyId, request.Name, request.Type, request.SqlTemplate);

        _db.BillingServices.Add(service);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { service.Id });
    }
}

public static class CreateBillingServiceEndpoints
{
    public static void MapCreateBillingServiceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/services", async (CreateBillingServiceCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}