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
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.ReferenceMonth).NotEmpty().Matches(@"^(0[1-9]|1[0-2])\/\d{4}$").WithMessage("O formato deve ser MM/YYYY.");
        RuleFor(x => x.StartDate).NotEmpty();
        RuleFor(x => x.EndDate).GreaterThanOrEqualTo(x => x.StartDate);
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
            .FirstOrDefaultAsync(c => c.CompanyId == companyId && c.CustomerId == request.CustomerId && c.ReferenceMonth == request.ReferenceMonth, ct);

        if (existingCycle != null)
        {
            if (existingCycle.Status == BillingStatus.Closed)
                return Results.BadRequest(new { Message = "Já existe uma fatura fechada para este período." });

            _db.BillingCycles.Remove(existingCycle);
            await _db.SaveChangesAsync(ct);
        }

        var cycle = new BillingCycle(companyId, request.CustomerId, request.ReferenceMonth, request.StartDate, request.EndDate);
        _db.BillingCycles.Add(cycle);

        var activeTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId && t.CustomerId == request.CustomerId &&
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
                var errorItem = new BillingItem(cycle.Id, tariff.BillingServiceId, $"{tariff.BillingService.Name} (ERRO)", 0, 0, null, $"Falha SQL: {ex.Message}");
                _db.BillingItems.Add(errorItem);
            }
        }

        foreach (var tariff in activeTariffs.Where(t => t.BillingService.Type == BillingServiceType.Manual_Entry))
        {
            _db.BillingItems.Add(new BillingItem(cycle.Id, tariff.BillingServiceId, tariff.BillingService.Name, 0, 0, null, "Aguardando apontamento manual"));
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { cycle.Id });
    }
}

public static class GenerateBillingCycleEndpoints
{
    public static void MapGenerateBillingCycleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/cycles/generate", async (GenerateBillingCycleCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}