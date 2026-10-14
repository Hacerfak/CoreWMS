using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record FiscalRuleExceptionDto(
    Guid Id,
    string? SpecificDestinationState,
    string? SpecificNcmStart,
    int? SpecificOrigin,
    string? CfopStateInternal,
    string? CfopInterstate,
    string? CstCsosnIcms,
    int? ModBcIcms,
    decimal? AliqIcms,
    decimal? ReducaoBcIcms,
    int? ModBcIcmsSt,
    decimal? MvaIcmsSt,
    decimal? ReducaoBcIcmsSt,
    decimal? AliqIcmsSt,
    int? MotivoDesoneracaoIcms,
    decimal? AliqCreditoSimples,
    string? CstIpi,
    int? CodigoEnquadramentoIpi,
    decimal? AliqIpi,
    string? CstPis,
    decimal? AliqPis,
    string? CstCofins,
    decimal? AliqCofins,
    string? CstIbs,
    decimal? AliqIbs,
    string? CstCbs,
    decimal? AliqCbs,
    string? ClassificacaoTributaria,
    string? AdditionalNotes,
    bool IsActive
);

public record FiscalOperationRuleDto(
    Guid Id,
    string Description,
    int Finalidade,
    string FinalidadeDescription,
    string CfopStateInternal,
    string CfopInterstate,
    string CstCsosnIcms,
    int ModBcIcms,
    decimal AliqIcms,
    decimal ReducaoBcIcms,
    int ModBcIcmsSt,
    decimal MvaIcmsSt,
    decimal ReducaoBcIcmsSt,
    decimal AliqIcmsSt,
    int? MotivoDesoneracaoIcms,
    decimal AliqCreditoSimples,
    string CstIpi,
    int CodigoEnquadramentoIpi,
    decimal AliqIpi,
    string CstPis,
    decimal AliqPis,
    string CstCofins,
    decimal AliqCofins,
    string? CstIbs,
    decimal AliqIbs,
    string? CstCbs,
    decimal AliqCbs,
    string? ClassificacaoTributaria,
    string? AdditionalNotes,
    bool IsActive,
    List<FiscalRuleExceptionDto> Exceptions
);

public record GetFiscalOperationRulesQuery() : IRequest<IResult>;

public record SaveFiscalOperationRuleCommand(
    Guid? Id,
    string Description,
    FiscalDocumentType Finalidade = FiscalDocumentType.Normal,
    string CfopStateInternal = "5906",
    string CfopInterstate = "6906",
    string CstCsosnIcms = "400",
    int ModBcIcms = 3,
    decimal AliqIcms = 0,
    decimal ReducaoBcIcms = 0,
    int ModBcIcmsSt = 4,
    decimal MvaIcmsSt = 0,
    decimal ReducaoBcIcmsSt = 0,
    decimal AliqIcmsSt = 0,
    int? MotivoDesoneracaoIcms = null,
    decimal AliqCreditoSimples = 0,
    string CstIpi = "53",
    int CodigoEnquadramentoIpi = 999,
    decimal AliqIpi = 0,
    string CstPis = "08",
    decimal AliqPis = 0,
    string CstCofins = "08",
    decimal AliqCofins = 0,
    string? CstIbs = "410",
    decimal AliqIbs = 0.10m,
    string? CstCbs = "410",
    decimal AliqCbs = 0.90m,
    string? ClassificacaoTributaria = "410999",
    string? AdditionalNotes = null
) : IRequest<IResult>;

public record AddOrUpdateExceptionCommand(
    Guid RuleId,
    Guid? ExceptionId,
    string? SpecificDestinationState,
    string? SpecificNcmStart,
    int? SpecificOrigin,
    string? CfopStateInternal,
    string? CfopInterstate,
    string? CstCsosnIcms,
    int? ModBcIcms,
    decimal? AliqIcms,
    decimal? ReducaoBcIcms,
    int? ModBcIcmsSt,
    decimal? MvaIcmsSt,
    decimal? ReducaoBcIcmsSt,
    decimal? AliqIcmsSt,
    int? MotivoDesoneracaoIcms,
    decimal? AliqCreditoSimples,
    string? CstIpi,
    int? CodigoEnquadramentoIpi,
    decimal? AliqIpi,
    string? CstPis,
    decimal? AliqPis,
    string? CstCofins,
    decimal? AliqCofins,
    string? CstIbs,
    decimal? AliqIbs,
    string? CstCbs,
    decimal? AliqCbs,
    string? ClassificacaoTributaria,
    string? AdditionalNotes
) : IRequest<IResult>;

public record ToggleFiscalRuleStatusCommand(Guid Id) : IRequest<IResult>;
public record DeleteFiscalRuleCommand(Guid Id) : IRequest<IResult>;
public record DeleteRuleExceptionCommand(Guid RuleId, Guid ExceptionId) : IRequest<IResult>;

public class SaveFiscalOperationRuleCommandValidator : AbstractValidator<SaveFiscalOperationRuleCommand>
{
    public SaveFiscalOperationRuleCommandValidator()
    {
        RuleFor(x => x.Description).NotEmpty().WithMessage("A descrição da natureza de operação é obrigatória.");
        RuleFor(x => x.CfopStateInternal).NotEmpty().Length(4).WithMessage("CFOP interno deve ter 4 dígitos.");
        RuleFor(x => x.CfopInterstate).NotEmpty().Length(4).WithMessage("CFOP interestadual deve ter 4 dígitos.");
    }
}

public class FiscalOperationRulesHandler :
    IRequestHandler<GetFiscalOperationRulesQuery, IResult>,
    IRequestHandler<SaveFiscalOperationRuleCommand, IResult>,
    IRequestHandler<AddOrUpdateExceptionCommand, IResult>,
    IRequestHandler<ToggleFiscalRuleStatusCommand, IResult>,
    IRequestHandler<DeleteFiscalRuleCommand, IResult>,
    IRequestHandler<DeleteRuleExceptionCommand, IResult>
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

        var rules = await _db.FiscalOperationRules
            .AsNoTracking()
            .Include(r => r.Exceptions)
            .Where(r => r.CompanyId == companyId)
            .OrderBy(r => r.Description)
            .Select(r => new FiscalOperationRuleDto(
                r.Id,
                r.Description,
                (int)r.Finalidade,
                ObterDescricaoFinalidade(r.Finalidade),
                r.CfopStateInternal,
                r.CfopInterstate,
                r.CstCsosnIcms,
                r.ModBcIcms,
                r.AliqIcms,
                r.ReducaoBcIcms,
                r.ModBcIcmsSt,
                r.MvaIcmsSt,
                r.ReducaoBcIcmsSt,
                r.AliqIcmsSt,
                r.MotivoDesoneracaoIcms,
                r.AliqCreditoSimples,
                r.CstIpi,
                r.CodigoEnquadramentoIpi,
                r.AliqIpi,
                r.CstPis,
                r.AliqPis,
                r.CstCofins,
                r.AliqCofins,
                r.CstIbs,
                r.AliqIbs,
                r.CstCbs,
                r.AliqCbs,
                r.ClassificacaoTributaria,
                r.AdditionalNotes,
                r.IsActive,
                r.Exceptions.Select(e => new FiscalRuleExceptionDto(
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
                )).ToList()
            )).ToListAsync(ct);

        return Results.Ok(rules);
    }

    public async Task<IResult> Handle(SaveFiscalOperationRuleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (request.Id.HasValue && request.Id.Value != Guid.Empty)
        {
            var rule = await _db.FiscalOperationRules
                .FirstOrDefaultAsync(r => r.Id == request.Id.Value && r.CompanyId == companyId, ct);

            if (rule == null) return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

            rule.Update(
                request.Description, request.Finalidade, request.CfopStateInternal, request.CfopInterstate,
                request.CstCsosnIcms, request.ModBcIcms, request.AliqIcms, request.ReducaoBcIcms,
                request.ModBcIcmsSt, request.MvaIcmsSt, request.ReducaoBcIcmsSt, request.AliqIcmsSt,
                request.MotivoDesoneracaoIcms, request.AliqCreditoSimples,
                request.CstIpi, request.CodigoEnquadramentoIpi, request.AliqIpi,
                request.CstPis, request.AliqPis,
                request.CstCofins, request.AliqCofins,
                request.CstIbs, request.AliqIbs,
                request.CstCbs, request.AliqCbs,
                request.ClassificacaoTributaria,
                request.AdditionalNotes
            );
        }
        else
        {
            var newRule = new FiscalOperationRule(
                companyId, request.Description, request.Finalidade, request.CfopStateInternal, request.CfopInterstate,
                request.CstCsosnIcms, request.ModBcIcms, request.AliqIcms, request.ReducaoBcIcms,
                request.ModBcIcmsSt, request.MvaIcmsSt, request.ReducaoBcIcmsSt, request.AliqIcmsSt,
                request.MotivoDesoneracaoIcms, request.AliqCreditoSimples,
                request.CstIpi, request.CodigoEnquadramentoIpi, request.AliqIpi,
                request.CstPis, request.AliqPis,
                request.CstCofins, request.AliqCofins,
                request.CstIbs, request.AliqIbs,
                request.CstCbs, request.AliqCbs,
                request.ClassificacaoTributaria,
                request.AdditionalNotes
            );

            _db.FiscalOperationRules.Add(newRule);
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Natureza de Operação salva com sucesso." });
    }

    public async Task<IResult> Handle(AddOrUpdateExceptionCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var rule = await _db.FiscalOperationRules
            .Include(r => r.Exceptions)
            .FirstOrDefaultAsync(r => r.Id == request.RuleId && r.CompanyId == companyId, ct);

        if (rule == null) return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        if (request.ExceptionId.HasValue && request.ExceptionId.Value != Guid.Empty)
        {
            var existingExc = rule.Exceptions.FirstOrDefault(e => e.Id == request.ExceptionId.Value);
            if (existingExc == null) return Results.NotFound(new { Message = "Linha de exceção não encontrada." });

            _db.FiscalOperationRuleExceptions.Remove(existingExc);
        }

        var newExc = new FiscalOperationRuleException(
            rule.Id,
            request.SpecificDestinationState,
            request.SpecificNcmStart,
            request.SpecificOrigin,
            request.CfopStateInternal,
            request.CfopInterstate,
            request.CstCsosnIcms,
            request.ModBcIcms,
            request.AliqIcms,
            request.ReducaoBcIcms,
            request.ModBcIcmsSt,
            request.MvaIcmsSt,
            request.ReducaoBcIcmsSt,
            request.AliqIcmsSt,
            request.MotivoDesoneracaoIcms,
            request.AliqCreditoSimples,
            request.CstIpi,
            request.CodigoEnquadramentoIpi,
            request.AliqIpi,
            request.CstPis,
            request.AliqPis,
            request.CstCofins,
            request.AliqCofins,
            request.CstIbs,
            request.AliqIbs,
            request.CstCbs,
            request.AliqCbs,
            request.ClassificacaoTributaria,
            request.AdditionalNotes
        );

        _db.FiscalOperationRuleExceptions.Add(newExc);

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Linha de exceção salva com sucesso." });
    }

    public async Task<IResult> Handle(ToggleFiscalRuleStatusCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var rule = await _db.FiscalOperationRules
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (rule == null) return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        rule.ToggleActive();
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = $"Natureza {(rule.IsActive ? "ativada" : "desativada")} com sucesso." });
    }

    public async Task<IResult> Handle(DeleteFiscalRuleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var rule = await _db.FiscalOperationRules
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (rule == null) return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        _db.FiscalOperationRules.Remove(rule);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Natureza de Operação excluída com sucesso." });
    }

    public async Task<IResult> Handle(DeleteRuleExceptionCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var exc = await _db.FiscalOperationRuleExceptions
            .Include(e => e.FiscalOperationRule)
            .FirstOrDefaultAsync(e => e.Id == request.ExceptionId
                                   && e.FiscalOperationRuleId == request.RuleId
                                   && e.FiscalOperationRule.CompanyId == companyId, ct);

        if (exc == null) return Results.NotFound(new { Message = "Exceção não encontrada." });

        _db.FiscalOperationRuleExceptions.Remove(exc);
        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Exceção removida com sucesso." });
    }

    private static string ObterDescricaoFinalidade(FiscalDocumentType finalidade)
    {
        return finalidade switch
        {
            FiscalDocumentType.Normal => "1 - NF-e Normal",
            FiscalDocumentType.Complementar => "2 - NF-e Complementar",
            FiscalDocumentType.Ajuste => "3 - NF-e de Ajuste",
            FiscalDocumentType.Devolucao => "4 - Devolução / Retorno",
            FiscalDocumentType.NotaCredito => "5 - Nota de Crédito (RT)",
            FiscalDocumentType.NotaDebito => "6 - Nota de Débito (RT)",
            _ => "1 - NF-e Normal"
        };
    }
}

public static class FiscalOperationRulesEndpoints
{
    public static void MapFiscalOperationRulesEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/fiscal/rules").WithTags("Fiscal").RequireAuthorization();

        group.MapGet("/", async (IMediator mediator) =>
            await mediator.Send(new GetFiscalOperationRulesQuery()))
            .RequirePermission(Permissions.Outbound.View);

        group.MapPost("/", async (SaveFiscalOperationRuleCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapPost("/{ruleId:guid}/exceptions", async (Guid ruleId, AddOrUpdateExceptionCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { RuleId = ruleId }))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapPatch("/{id:guid}/toggle", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ToggleFiscalRuleStatusCommand(id)))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteFiscalRuleCommand(id)))
            .RequirePermission(Permissions.Outbound.Manage);

        group.MapDelete("/{ruleId:guid}/exceptions/{exceptionId:guid}", async (Guid ruleId, Guid exceptionId, IMediator mediator) =>
            await mediator.Send(new DeleteRuleExceptionCommand(ruleId, exceptionId)))
            .RequirePermission(Permissions.Outbound.Manage);
    }
}