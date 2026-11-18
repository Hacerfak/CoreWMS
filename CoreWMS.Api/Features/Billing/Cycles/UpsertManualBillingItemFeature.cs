using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record UpsertManualBillingItemCommand(
    Guid CycleId,
    Guid BillingServiceId,
    string Description,
    decimal QuantityTotal,
    decimal ServiceTotal,
    string? ManualNotes = null,
    DateTime? ChargeDate = null,
    string? DocumentNumber = null
) : IRequest<IResult>;

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

        // Apontamentos manuais são exclusivos da administração interna
        if (_tenant.IsPartnerUser())
            return Results.Forbid();

        var cycle = await _db.BillingCycles
            .FirstOrDefaultAsync(c => c.Id == request.CycleId && c.CompanyId == companyId, ct);

        if (cycle == null) return Results.NotFound(new { Message = "Ciclo não encontrado." });
        if (cycle.Status == BillingStatus.Closed)
            return Results.BadRequest(new { Message = "Não é possível alterar o extrato de um ciclo de faturamento já fechado." });

        var service = await _db.BillingServices
            .FirstOrDefaultAsync(s => s.Id == request.BillingServiceId && s.CompanyId == companyId, ct);

        if (service == null) return Results.BadRequest(new { Message = "Serviço de faturamento inválido." });

        DateTime effectiveDate;
        if (request.ChargeDate.HasValue)
        {
            effectiveDate = request.ChargeDate.Value.Date;
        }
        else
        {
            var tz = GetBrasiliaTimeZone();
            effectiveDate = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz).Date;
        }

        var normalizedChargeDate = DateTime.SpecifyKind(effectiveDate, DateTimeKind.Utc);

        var item = new BillingItem(
            billingCycleId: cycle.Id,
            billingServiceId: request.BillingServiceId,
            chargeDate: normalizedChargeDate,
            documentType: "Manual",
            documentNumber: string.IsNullOrWhiteSpace(request.DocumentNumber) ? "Avulso" : request.DocumentNumber.Trim(),
            documentId: null,
            description: request.Description,
            quantityTotal: request.QuantityTotal,
            serviceTotal: request.ServiceTotal,
            statementDataJson: null,
            manualNotes: request.ManualNotes
        );

        _db.BillingItems.Add(item);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { item.Id, Message = "Lançamento efetuado com sucesso." });
    }

    private static TimeZoneInfo GetBrasiliaTimeZone()
    {
        string[] tzIds = ["America/Sao_Paulo", "E. South America Standard Time"];
        foreach (var id in tzIds)
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("Brasilia", TimeSpan.FromHours(-3), "Brasilia", "Brasilia");
    }
}

public static class UpsertManualBillingItemEndpoints
{
    public static void MapUpsertManualBillingItemEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/cycles/{cycleId:guid}/items/manual", async (
            Guid cycleId,
            UpsertManualBillingItemCommand cmd,
            IMediator mediator) =>
            await mediator.Send(cmd with { CycleId = cycleId }))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}