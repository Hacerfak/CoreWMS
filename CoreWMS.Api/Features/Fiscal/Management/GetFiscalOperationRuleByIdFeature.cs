using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record GetFiscalOperationRuleByIdQuery(Guid Id) : IRequest<IResult>;

public class GetFiscalOperationRuleByIdHandler : IRequestHandler<GetFiscalOperationRuleByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetFiscalOperationRuleByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetFiscalOperationRuleByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var rule = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions)
            .Where(r => r.Id == request.Id && r.CompanyId == companyId)
            .Select(r => r.ToDto())
            .FirstOrDefaultAsync(ct);

        if (rule == null)
            return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        return Results.Ok(rule);
    }
}

public static class GetFiscalOperationRuleByIdEndpoints
{
    public static void MapGetFiscalOperationRuleByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/fiscal/rules/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new GetFiscalOperationRuleByIdQuery(id)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.View);
    }
}