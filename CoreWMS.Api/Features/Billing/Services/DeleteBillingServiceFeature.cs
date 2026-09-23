using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Services;

public record DeleteBillingServiceCommand(Guid Id) : IRequest<IResult>;

public class DeleteBillingServiceHandler : IRequestHandler<DeleteBillingServiceCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteBillingServiceHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteBillingServiceCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var service = await _db.BillingServices
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.CompanyId == companyId, ct);

        if (service == null) return Results.NotFound();

        // Checa se está vinculado a alguma tarifa ativa
        var isUsedInTariff = await _db.CustomerTariffs.AnyAsync(t => t.BillingServiceId == request.Id, ct);
        if (isUsedInTariff)
            return Results.BadRequest(new { Message = "Este serviço não pode ser excluído pois possui tarifas vinculadas a depositantes." });

        _db.BillingServices.Remove(service);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class DeleteBillingServiceEndpoints
{
    public static void MapDeleteBillingServiceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/billing/services/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteBillingServiceCommand(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}