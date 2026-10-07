using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record FiscalOperationRuleDto(
    Guid Id,
    string Description,
    int OperationType,
    string OperationTypeName,
    string CfopStateInternal,
    string CfopInterstate,
    string CstCsosnIcms,
    string CstPisCofins,
    string CstIpi,
    string? CstIbs,
    decimal AliqIbs,
    string? CstCbs,
    decimal AliqCbs,
    string? AdditionalNotes,
    Guid? SpecificCustomerId,
    string? SpecificCustomerName,
    string? SpecificDestinationState,
    string? SpecificNcmStart,
    int Priority,
    bool IsActive
);

public record GetFiscalOperationRulesQuery(FiscalOperationType? OperationType = null) : IRequest<IResult>;

public record SaveFiscalOperationRuleCommand(
    Guid? Id,
    string Description,
    FiscalOperationType OperationType,
    string CfopStateInternal,
    string CfopInterstate,
    string CstCsosnIcms,
    string CstPisCofins,
    string CstIpi,
    string? CstIbs,
    decimal AliqIbs,
    string? CstCbs,
    decimal AliqCbs,
    string? AdditionalNotes,
    Guid? SpecificCustomerId,
    string? SpecificDestinationState,
    string? SpecificNcmStart,
    int Priority
) : IRequest<IResult>;

public record ToggleFiscalRuleStatusCommand(Guid Id) : IRequest<IResult>;
public record DeleteFiscalRuleCommand(Guid Id) : IRequest<IResult>;

public class SaveFiscalOperationRuleCommandValidator : AbstractValidator<SaveFiscalOperationRuleCommand>
{
    public SaveFiscalOperationRuleCommandValidator()
    {
        RuleFor(x => x.Description).NotEmpty().WithMessage("A descrição da regra é obrigatória.");
        RuleFor(x => x.CfopStateInternal).NotEmpty().Length(4).WithMessage("CFOP interno deve ter 4 dígitos.");
        RuleFor(x => x.CfopInterstate).NotEmpty().Length(4).WithMessage("CFOP interestadual deve ter 4 dígitos.");
    }
}

public class FiscalOperationRulesHandler :
    IRequestHandler<GetFiscalOperationRulesQuery, IResult>,
    IRequestHandler<SaveFiscalOperationRuleCommand, IResult>,
    IRequestHandler<ToggleFiscalRuleStatusCommand, IResult>,
    IRequestHandler<DeleteFiscalRuleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public FiscalOperationRulesHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetFiscalOperationRulesQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var query = _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.SpecificCustomer)
            .Where(r => r.CompanyId == companyId);

        if (request.OperationType.HasValue)
            query = query.Where(r => r.OperationType == request.OperationType.Value);

        var rules = await query
            .OrderByDescending(r => r.Priority)
            .ThenBy(r => r.Description)
            .Select(r => new FiscalOperationRuleDto(
                r.Id,
                r.Description,
                (int)r.OperationType,
                r.OperationType.ToString(),
                r.CfopStateInternal,
                r.CfopInterstate,
                r.CstCsosnIcms,
                r.CstPisCofins,
                r.CstIpi,
                r.CstIbs,
                r.AliqIbs,
                r.CstCbs,
                r.AliqCbs,
                r.AdditionalNotes,
                r.SpecificCustomerId,
                r.SpecificCustomer != null ? r.SpecificCustomer.CorporateName : null,
                r.SpecificDestinationState,
                r.SpecificNcmStart,
                r.Priority,
                r.IsActive
            )).ToListAsync(ct);

        return Results.Ok(rules);
    }

    public async Task<IResult> Handle(SaveFiscalOperationRuleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (request.Id.HasValue && request.Id.Value != Guid.Empty)
        {
            var existingRule = await _db.FiscalOperationRules
                .FirstOrDefaultAsync(r => r.Id == request.Id.Value && r.CompanyId == companyId, ct);

            if (existingRule == null) return Results.NotFound(new { Message = "Regra fiscal não encontrada." });

            existingRule.Update(
                request.Description, request.OperationType, request.CfopStateInternal, request.CfopInterstate,
                request.CstCsosnIcms, request.CstPisCofins, request.CstIpi, request.CstIbs, request.AliqIbs,
                request.CstCbs, request.AliqCbs, request.AdditionalNotes, request.SpecificCustomerId,
                request.SpecificDestinationState, request.SpecificNcmStart, request.Priority
            );
        }
        else
        {
            var newRule = new FiscalOperationRule(
                companyId, request.Description, request.OperationType, request.CfopStateInternal, request.CfopInterstate,
                request.CstCsosnIcms, request.CstPisCofins, request.CstIpi, request.CstIbs, request.AliqIbs,
                request.CstCbs, request.AliqCbs, request.AdditionalNotes, request.SpecificCustomerId,
                request.SpecificDestinationState, request.SpecificNcmStart, request.Priority
            );

            _db.FiscalOperationRules.Add(newRule);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Regra de operação fiscal salva com sucesso." });
    }

    public async Task<IResult> Handle(ToggleFiscalRuleStatusCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var rule = await _db.FiscalOperationRules
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (rule == null) return Results.NotFound(new { Message = "Regra fiscal não encontrada." });

        rule.ToggleActive();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = $"Regra fiscal {(rule.IsActive ? "ativada" : "desativada")} com sucesso." });
    }

    public async Task<IResult> Handle(DeleteFiscalRuleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var rule = await _db.FiscalOperationRules
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (rule == null) return Results.NotFound(new { Message = "Regra fiscal não encontrada." });

        _db.FiscalOperationRules.Remove(rule);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Regra fiscal excluída com sucesso." });
    }
}

public static class FiscalOperationRulesEndpoints
{
    public static void MapFiscalOperationRulesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/rules").WithTags("Fiscal").RequireAuthorization();

        group.MapGet("/", async (FiscalOperationType? type, IMediator mediator) =>
            await mediator.Send(new GetFiscalOperationRulesQuery(type)))
            .RequirePermission(Permissions.Outbound.View);

        group.MapPost("/", async (SaveFiscalOperationRuleCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapPatch("/{id:guid}/toggle", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ToggleFiscalRuleStatusCommand(id)))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteFiscalRuleCommand(id)))
            .RequirePermission(Permissions.Outbound.Manage);
    }
}