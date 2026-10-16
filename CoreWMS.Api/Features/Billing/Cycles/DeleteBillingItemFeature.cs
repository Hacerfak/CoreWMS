using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record DeleteBillingItemCommand(Guid CycleId, Guid ItemId) : IRequest<IResult>;

public class DeleteBillingItemHandler : IRequestHandler<DeleteBillingItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingChannel? _billingChannel;

    public DeleteBillingItemHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingChannel? billingChannel = null)
    {
        _db = db;
        _tenant = tenant;
        _billingChannel = billingChannel;
    }

    public async Task<IResult> Handle(DeleteBillingItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.Id == request.CycleId && c.CompanyId == companyId, ct);

        if (cycle == null)
            return Results.NotFound(new { Message = "Ciclo de faturamento não encontrado." });

        if (cycle.Status == BillingStatus.Closed)
            return Results.BadRequest(new { Message = "Este ciclo já está fechado e não permite remoção de itens." });

        var item = cycle.Items.FirstOrDefault(i => i.Id == request.ItemId);
        if (item == null)
            return Results.NotFound(new { Message = "Item de cobrança não localizado no ciclo." });

        var chargeDate = item.ChargeDate;
        var docId = item.DocumentId;
        var isDaily = item.DocumentType == "Diária de Estoque";

        _db.BillingItems.Remove(item);
        await _db.SaveChangesAsync(ct);

        // Se for uma diária excluída, enfileira o recálculo do dia para recompor o saldo real caso ainda haja estoque
        if (isDaily && _billingChannel != null)
        {
            await _billingChannel.EnqueueRecalculationAsync(new BillingRecalculationTask(
                CompanyId: companyId,
                CustomerId: cycle.CustomerId,
                ReferenceDate: chargeDate,
                TriggerOrderId: docId,
                TriggerType: "Manual_Item_Deleted"
            ), ct);
        }

        return Results.NoContent();
    }
}

public static class DeleteBillingItemEndpoints
{
    public static void MapDeleteBillingItemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/billing/cycles/{cycleId:guid}/items/{itemId:guid}", async (
            Guid cycleId,
            Guid itemId,
            IMediator mediator) =>
        {
            return await mediator.Send(new DeleteBillingItemCommand(cycleId, itemId));
        })
        .WithTags("Billing")
        .RequireAuthorization()
        .RequirePermission(Permissions.Billing.Manage);
    }
}