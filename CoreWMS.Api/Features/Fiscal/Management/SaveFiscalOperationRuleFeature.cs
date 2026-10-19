using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

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

public class SaveFiscalOperationRuleCommandValidator : AbstractValidator<SaveFiscalOperationRuleCommand>
{
    public SaveFiscalOperationRuleCommandValidator()
    {
        RuleFor(x => x.Description)
            .NotEmpty().WithMessage("A descrição da natureza de operação é obrigatória.")
            .MaximumLength(60).WithMessage("A descrição da natureza de operação (natOp) deve ter no máximo 60 caracteres conforme padrão SEFAZ.");

        RuleFor(x => x.CfopStateInternal)
            .NotEmpty().Length(4).WithMessage("CFOP interno deve ter 4 dígitos.");

        RuleFor(x => x.CfopInterstate)
            .NotEmpty().Length(4).WithMessage("CFOP interestadual deve ter 4 dígitos.");
    }
}

public class SaveFiscalOperationRuleHandler : IRequestHandler<SaveFiscalOperationRuleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public SaveFiscalOperationRuleHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(SaveFiscalOperationRuleCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        Guid savedId;

        if (request.Id.HasValue && request.Id.Value != Guid.Empty)
        {
            var rule = await _db.FiscalOperationRules
                .FirstOrDefaultAsync(r => r.Id == request.Id.Value && r.CompanyId == companyId, ct);

            if (rule == null)
                return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

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
            savedId = rule.Id;
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
            savedId = newRule.Id;
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Natureza de Operação salva com sucesso.", Id = savedId });
    }
}

public static class SaveFiscalOperationRuleEndpoints
{
    public static void MapSaveFiscalOperationRuleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/rules", async (SaveFiscalOperationRuleCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}