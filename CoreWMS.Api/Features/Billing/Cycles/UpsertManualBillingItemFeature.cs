using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record UpsertManualBillingItemCommand(
    Guid CycleId, Guid BillingServiceId, string Description,
    decimal QuantityTotal, decimal ServiceTotal, string? ManualNotes) : IRequest<IResult>;

public class UpsertManualBillingItemValidator : AbstractValidator<UpsertManualBillingItemCommand>
{
    public UpsertManualBillingItemValidator()
    {
        RuleFor(x => x.CycleId).NotEmpty();
        RuleFor(x => x.BillingServiceId).NotEmpty();
        RuleFor(x => x.Description).NotEmpty().MaximumLength(200);
        RuleFor(x => x.QuantityTotal).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ServiceTotal).GreaterThanOrEqualTo(0);
    }
}

public class UpsertManualBillingItemHandler : IRequestHandler<UpsertManualBillingItemCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpsertManualBillingItemHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpsertManualBillingItemCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var cycle = await _db.BillingCycles
            .FirstOrDefaultAsync(c => c.Id == request.CycleId && c.CompanyId == companyId, ct);

        if (cycle == null) return Results.NotFound(new { Message = "Ciclo não encontrado." });
        if (cycle.Status == BillingStatus.Closed)
            return Results.BadRequest(new { Message = "Não é possível alterar o extrato de um ciclo de faturamento já fechado." });

        var service = await _db.BillingServices.FirstOrDefaultAsync(s => s.Id == request.BillingServiceId, ct);
        if (service == null) return Results.BadRequest(new { Message = "Serviço de faturamento inválido." });

        var item = new BillingItem(
            cycle.Id,
            request.BillingServiceId,
            request.Description,
            request.QuantityTotal,
            request.ServiceTotal,
            null,
            request.ManualNotes
        );

        _db.BillingItems.Add(item);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { item.Id, Message = "Lançamento efetuado com sucesso." });
    }
}

public static class UpsertManualBillingItemEndpoints
{
    public static void MapUpsertManualBillingItemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/cycles/{cycleId:guid}/items/manual", async (Guid cycleId, UpsertManualBillingItemCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { CycleId = cycleId }))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}