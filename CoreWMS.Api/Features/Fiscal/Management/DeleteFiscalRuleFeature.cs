using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record DeleteFiscalRuleCommand(Guid Id) : IRequest<IResult>;

public class DeleteFiscalRuleHandler : IRequestHandler<DeleteFiscalRuleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteFiscalRuleHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteFiscalRuleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var rule = await _db.FiscalOperationRules
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (rule == null)
            return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        _db.FiscalOperationRules.Remove(rule);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Natureza de Operação excluída com sucesso." });
    }
}

public static class DeleteFiscalRuleEndpoints
{
    public static void MapDeleteFiscalRuleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/fiscal/rules/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteFiscalRuleCommand(id)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}