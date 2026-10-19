using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record DeleteRuleExceptionCommand(Guid RuleId, Guid ExceptionId) : IRequest<IResult>;

public class DeleteRuleExceptionHandler : IRequestHandler<DeleteRuleExceptionCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteRuleExceptionHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteRuleExceptionCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var exc = await _db.FiscalOperationRuleExceptions
            .Include(e => e.FiscalOperationRule)
            .FirstOrDefaultAsync(e => e.Id == request.ExceptionId
                                   && e.FiscalOperationRuleId == request.RuleId
                                   && e.FiscalOperationRule.CompanyId == companyId, ct);

        if (exc == null)
            return Results.NotFound(new { Message = "Exceção não encontrada." });

        _db.FiscalOperationRuleExceptions.Remove(exc);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Exceção removida com sucesso." });
    }
}

public static class DeleteRuleExceptionEndpoints
{
    public static void MapDeleteRuleExceptionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/fiscal/rules/{ruleId:guid}/exceptions/{exceptionId:guid}", async (Guid ruleId, Guid exceptionId, IMediator mediator) =>
            await mediator.Send(new DeleteRuleExceptionCommand(ruleId, exceptionId)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}