using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Cycles;

public record GenerateBillingCycleCommand(Guid CustomerId, string ReferenceMonth, DateTime StartDate, DateTime EndDate) : IRequest<IResult>;

public class GenerateBillingCycleCommandValidator : AbstractValidator<GenerateBillingCycleCommand>
{
    public GenerateBillingCycleCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithMessage("O depositante é obrigatório.");
        RuleFor(x => x.ReferenceMonth).NotEmpty().Matches(@"^(0[1-9]|1[0-2])\/\d{4}$").WithMessage("O formato do mês de referência deve ser MM/yyyy (Ex: 10/2026).");
        RuleFor(x => x.StartDate).NotEmpty().WithMessage("A data inicial é obrigatória.");
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.StartDate).WithMessage("A data final deve ser maior ou igual à data inicial.");
    }
}

public class GenerateBillingCycleHandler : IRequestHandler<GenerateBillingCycleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly BillingEngineService _engine;
    private readonly ITenantProvider _tenant;

    public GenerateBillingCycleHandler(ApplicationDbContext db, BillingEngineService engine, ITenantProvider tenant)
    {
        _db = db;
        _engine = engine;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GenerateBillingCycleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var existingCycle = await _db.BillingCycles
            .Include(c => c.Items)
                .ThenInclude(i => i.BillingService)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == request.CustomerId &&
                                      c.ReferenceMonth == request.ReferenceMonth.Trim(), ct);

        BillingCycle cycle;

        if (existingCycle != null)
        {
            if (existingCycle.Status == BillingStatus.Closed)
                return Results.BadRequest(new { Message = "Este ciclo de faturamento já foi fechado e não permite recálculo." });

            var autoItemsToRemove = existingCycle.Items
                .Where(i => i.BillingService != null && i.BillingService.Type == BillingServiceType.Automatic_SQL)
                .ToList();

            if (autoItemsToRemove.Any())
            {
                _db.BillingItems.RemoveRange(autoItemsToRemove);
            }

            cycle = existingCycle;
        }
        else
        {
            cycle = new BillingCycle(companyId, request.CustomerId, request.ReferenceMonth, request.StartDate, request.EndDate);
            _db.BillingCycles.Add(cycle);
        }

        var activeTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId &&
                        t.CustomerId == request.CustomerId &&
                        t.BillingService.IsActive &&
                        t.ValidFrom <= request.EndDate &&
                        (t.ValidTo == null || t.ValidTo >= request.StartDate))
            .ToListAsync(ct);

        foreach (var tariff in activeTariffs.Where(t => t.BillingService.Type == BillingServiceType.Automatic_SQL))
        {
            try
            {
                var billingItem = await _engine.ExecuteServiceAsync(cycle, tariff.BillingService, tariff);
                _db.BillingItems.Add(billingItem);
            }
            catch (Exception ex)
            {
                var errorItem = new BillingItem(
                    cycle.Id,
                    tariff.BillingServiceId,
                    $"{tariff.BillingService.Name} (ERRO)",
                    0,
                    0,
                    null,
                    $"Falha SQL: {ex.Message}"
                );
                _db.BillingItems.Add(errorItem);
            }
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { cycle.Id, Message = "Ciclo de faturamento processado com sucesso. Os apontamentos operacionais foram preservados." });
    }
}

public static class GenerateBillingCycleEndpoints
{
    public static void MapGenerateBillingCycleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/cycles/generate", async (GenerateBillingCycleCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .WithTags("Billing")
            .RequireAuthorization()
            .RequirePermission(Permissions.Billing.Manage);
    }
}