using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record ToggleFiscalRuleStatusCommand(Guid Id) : IRequest<IResult>;

public class ToggleFiscalRuleStatusHandler : IRequestHandler<ToggleFiscalRuleStatusCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ToggleFiscalRuleStatusHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ToggleFiscalRuleStatusCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var rule = await _db.FiscalOperationRules
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (rule == null)
            return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        rule.ToggleActive();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = $"Natureza {(rule.IsActive ? "ativada" : "desativada")} com sucesso." });
    }
}

public static class ToggleFiscalRuleStatusEndpoints
{
    public static void MapToggleFiscalRuleStatusEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/api/fiscal/rules/{id:guid}/toggle", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ToggleFiscalRuleStatusCommand(id)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}