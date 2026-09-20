using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// 1. Request
public record DeleteCustomerCommand(Guid Id) : IRequest<IResult>;

// 2. Handler
public class DeleteCustomerHandler : IRequestHandler<DeleteCustomerCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteCustomerHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteCustomerCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);
        if (customer == null) return Results.NotFound();

        customer.Deactivate();
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// 3. Endpoint
public static class DeleteCustomerEndpoints
{
    public static void MapDeleteCustomerEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/customers/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteCustomerCommand(id)))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.Delete);
    }
}