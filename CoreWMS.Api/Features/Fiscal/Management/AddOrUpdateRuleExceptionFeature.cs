using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

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

public class AddOrUpdateExceptionCommandValidator : AbstractValidator<AddOrUpdateExceptionCommand>
{
    public AddOrUpdateExceptionCommandValidator()
    {
        RuleFor(x => x.RuleId).NotEmpty().WithMessage("O identificador da Natureza de Operação é obrigatório.");
        When(x => !string.IsNullOrWhiteSpace(x.CfopStateInternal), () =>
            RuleFor(x => x.CfopStateInternal).Length(4).WithMessage("CFOP interno deve ter 4 dígitos."));
        When(x => !string.IsNullOrWhiteSpace(x.CfopInterstate), () =>
            RuleFor(x => x.CfopInterstate).Length(4).WithMessage("CFOP interestadual deve ter 4 dígitos."));
    }
}

public class AddOrUpdateRuleExceptionHandler : IRequestHandler<AddOrUpdateExceptionCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public AddOrUpdateRuleExceptionHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(AddOrUpdateExceptionCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var rule = await _db.FiscalOperationRules
            .Include(r => r.Exceptions)
            .FirstOrDefaultAsync(r => r.Id == request.RuleId && r.CompanyId == companyId, ct);

        if (rule == null)
            return Results.NotFound(new { Message = "Natureza de Operação não encontrada." });

        if (request.ExceptionId.HasValue && request.ExceptionId.Value != Guid.Empty)
        {
            var existingExc = rule.Exceptions.FirstOrDefault(e => e.Id == request.ExceptionId.Value);
            if (existingExc == null)
                return Results.NotFound(new { Message = "Linha de exceção não encontrada." });

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
}

public static class AddOrUpdateRuleExceptionEndpoints
{
    public static void MapAddOrUpdateRuleExceptionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fiscal/rules/{ruleId:guid}/exceptions", async (Guid ruleId, AddOrUpdateExceptionCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { RuleId = ruleId }))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}