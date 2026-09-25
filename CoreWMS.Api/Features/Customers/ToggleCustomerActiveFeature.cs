using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

public record ToggleCustomerActiveCommand(Guid Id) : IRequest<IResult>;

public class ToggleCustomerActiveHandler : IRequestHandler<ToggleCustomerActiveCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ToggleCustomerActiveHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ToggleCustomerActiveCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var customer = await _db.Customers.FirstOrDefaultAsync(c => c.Id == request.Id && c.CompanyId == companyId, ct);

        if (customer == null) return Results.NotFound(new { Message = "Cliente não encontrado." });

        if (customer.IsActive)
            customer.Deactivate();
        else
            customer.Activate();

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            customer.IsActive,
            Message = customer.IsActive ? "Cliente reativado com sucesso!" : "Cliente inativado com sucesso!"
        });
    }
}

public static class ToggleCustomerActiveEndpoints
{
    public static void MapToggleCustomerActiveEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/api/customers/{id:guid}/toggle-active", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ToggleCustomerActiveCommand(id)))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.Edit);
    }
}