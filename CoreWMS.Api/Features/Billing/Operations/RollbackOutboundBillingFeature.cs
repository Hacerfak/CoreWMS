using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Operations;

public record RollbackOutboundBillingCommand(
    Guid OrderId,
    string OrderNumber,
    Guid CustomerId
) : IRequest<IResult>;

public class RollbackOutboundBillingCommandValidator : AbstractValidator<RollbackOutboundBillingCommand>
{
    public RollbackOutboundBillingCommandValidator()
    {
        RuleFor(x => x.OrderId).NotEmpty().WithMessage("ID da ordem obrigatório.");
        RuleFor(x => x.OrderNumber).NotEmpty().WithMessage("Número da ordem obrigatório.");
    }
}

public class RollbackOutboundBillingHandler : IRequestHandler<RollbackOutboundBillingCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly BillingEngineService _billingEngine;

    public RollbackOutboundBillingHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        BillingEngineService billingEngine)
    {
        _db = db;
        _tenant = tenant;
        _billingEngine = billingEngine;
    }

    public async Task<IResult> Handle(RollbackOutboundBillingCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // Localiza e remove todas as frações da ordem de saída em ciclos abertos
        var billingItems = await _db.BillingItems
            .Where(b => (b.DocumentId == request.OrderId || b.Description.Contains(request.OrderNumber))
                     && _db.BillingCycles.Any(c => c.Id == b.BillingCycleId && c.Status == BillingStatus.Draft && c.CompanyId == companyId))
            .ToListAsync(ct);

        if (billingItems.Any())
        {
            _db.BillingItems.RemoveRange(billingItems);
            await _db.SaveChangesAsync(ct);
        }

        // Recalibra as diárias de stock em tempo real
        await _billingEngine.UpsertDailyChargesAsync(
            companyId,
            request.CustomerId,
            DateTime.UtcNow,
            ct
        );

        return Results.Ok(new { Message = "Faturamento da ordem de saída estornado com sucesso." });
    }
}

public static class RollbackOutboundBillingEndpoints
{
    public static void MapRollbackOutboundBillingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/billing/outbound/rollback", async ([FromBody] RollbackOutboundBillingCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}