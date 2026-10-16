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
        RuleFor(x => x.ReferenceMonth).NotEmpty().Matches(@"^(0[1-9]|1[0-2])\/\d{4}$").WithMessage("O formato deve ser MM/yyyy.");
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

        var cycle = await _db.BillingCycles
            .Include(c => c.Items)
            .FirstOrDefaultAsync(c => c.CompanyId == companyId &&
                                      c.CustomerId == request.CustomerId &&
                                      c.ReferenceMonth == request.ReferenceMonth.Trim(), ct);

        if (cycle == null)
        {
            cycle = new BillingCycle(companyId, request.CustomerId, request.ReferenceMonth, request.StartDate, request.EndDate);
            _db.BillingCycles.Add(cycle);
            await _db.SaveChangesAsync(ct);
        }
        else if (cycle.Status == BillingStatus.Closed)
        {
            return Results.BadRequest(new { Message = "Este ciclo de faturamento já foi encerrado e não permite recálculo." });
        }

        // Executa o recálculo cumulativo de diárias dia a dia
        var recalculatedEntries = await _engine.RecalculateFullCycleAsync(cycle, ct);

        return Results.Ok(new
        {
            cycle.Id,
            Message = $"Ciclo de faturamento recalculado com sucesso. {recalculatedEntries} diárias atualizadas sem perda de eventos operacionais."
        });
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