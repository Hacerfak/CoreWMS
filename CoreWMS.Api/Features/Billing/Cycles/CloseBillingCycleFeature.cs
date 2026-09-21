using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record CloseBillingCycleCommand(Guid Id) : IRequest<IResult>;

public class CloseBillingCycleHandler : IRequestHandler<CloseBillingCycleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CloseBillingCycleHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CloseBillingCycleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var cycle = await _db.BillingCycles
            .FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);

        if (cycle == null) return Results.NotFound();

        if (cycle.Status == BillingStatus.Closed)
            return Results.BadRequest(new { Message = "Este ciclo de faturamento já está fechado." });

        cycle.CloseCycle();

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public static class CloseBillingCycleEndpoints
{
    public static void MapCloseBillingCycleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/cycles/{id:guid}/close", async (Guid id, IMediator mediator) => await mediator.Send(new CloseBillingCycleCommand(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}