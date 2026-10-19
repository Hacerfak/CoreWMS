using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record GetRuleExceptionByIdQuery(Guid RuleId, Guid ExceptionId) : IRequest<IResult>;

public class GetRuleExceptionByIdHandler : IRequestHandler<GetRuleExceptionByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetRuleExceptionByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetRuleExceptionByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var exc = await _db.FiscalOperationRuleExceptions
            .AsNoTracking()
            .Include(e => e.FiscalOperationRule)
            .Where(e => e.Id == request.ExceptionId
                     && e.FiscalOperationRuleId == request.RuleId
                     && e.FiscalOperationRule.CompanyId == companyId)
            .Select(e => new FiscalRuleExceptionDto(
                e.Id,
                e.SpecificDestinationState,
                e.SpecificNcmStart,
                e.SpecificOrigin,
                e.CfopStateInternal,
                e.CfopInterstate,
                e.CstCsosnIcms,
                e.ModBcIcms,
                e.AliqIcms,
                e.ReducaoBcIcms,
                e.ModBcIcmsSt,
                e.MvaIcmsSt,
                e.ReducaoBcIcmsSt,
                e.AliqIcmsSt,
                e.MotivoDesoneracaoIcms,
                e.AliqCreditoSimples,
                e.CstIpi,
                e.CodigoEnquadramentoIpi,
                e.AliqIpi,
                e.CstPis,
                e.AliqPis,
                e.CstCofins,
                e.AliqCofins,
                e.CstIbs,
                e.AliqIbs,
                e.CstCbs,
                e.AliqCbs,
                e.ClassificacaoTributaria,
                e.AdditionalNotes,
                e.IsActive
            ))
            .FirstOrDefaultAsync(ct);

        if (exc == null)
            return Results.NotFound(new { Message = "Linha de exceção fiscal não encontrada." });

        return Results.Ok(exc);
    }
}

public static class GetRuleExceptionByIdEndpoints
{
    public static void MapGetRuleExceptionByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/rules/{ruleId:guid}/exceptions/{exceptionId:guid}", async (
            Guid ruleId,
            Guid exceptionId,
            IMediator mediator) =>
                await mediator.Send(new GetRuleExceptionByIdQuery(ruleId, exceptionId)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.View);
    }
}