using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record BillingItemDto(
    Guid Id, Guid BillingServiceId, string ServiceName, string Description,
    decimal QuantityTotal, decimal ServiceTotal, string? StatementDataJson, string? ManualNotes);

public record BillingCycleDetailsDto(
    Guid Id, Guid CustomerId, string CustomerName, string ReferenceMonth,
    DateTime StartDate, DateTime EndDate, string Status, decimal TotalAmount,
    List<BillingItemDto> Items);

public record GetBillingCycleDetailsQuery(Guid Id) : IRequest<IResult>;

public class GetBillingCycleDetailsHandler : IRequestHandler<GetBillingCycleDetailsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetBillingCycleDetailsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetBillingCycleDetailsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.BillingCycles.AsNoTracking()
            .Include(c => c.Customer)
            .Include(c => c.Items)
                .ThenInclude(i => i.BillingService)
            .Where(c => c.Id == request.Id && c.CompanyId == companyId);

        if (_tenant.IsPartnerUser())
        {
            var allowedIds = _tenant.GetAllowedCustomerIds();
            query = query.Where(c => allowedIds.Contains(c.CustomerId));
        }

        var cycle = await query.FirstOrDefaultAsync(ct);
        if (cycle == null) return Results.NotFound(new { Message = "Ciclo de faturamento não encontrado." });

        var dto = new BillingCycleDetailsDto(
            cycle.Id, cycle.CustomerId, cycle.Customer.CorporateName, cycle.ReferenceMonth,
            cycle.StartDate, cycle.EndDate, cycle.Status.ToString(), cycle.TotalAmount,
            cycle.Items.Select(i => new BillingItemDto(
                i.Id, i.BillingServiceId, i.BillingService?.Name ?? i.Description,
                i.Description, i.QuantityTotal, i.ServiceTotal,
                i.StatementDataJson, i.ManualNotes
            )).ToList()
        );

        return Results.Ok(dto);
    }
}

public static class GetBillingCycleDetailsEndpoints
{
    public static void MapGetBillingCycleDetailsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/billing/cycles/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetBillingCycleDetailsQuery(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);
    }
}