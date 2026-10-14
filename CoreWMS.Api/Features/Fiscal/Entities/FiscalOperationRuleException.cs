using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Fiscal.Entities;

public class FiscalOperationRuleException : AuditableEntity
{
    public Guid FiscalOperationRuleId { get; private set; }
    public FiscalOperationRule FiscalOperationRule { get; private set; } = null!;

    // --- CONDIÇÕES DA EXCEÇÃO (Se nulo, aplica para qualquer valor) ---
    public string? SpecificDestinationState { get; private set; } // UF de destino (Ex: "SP")
    public string? SpecificNcmStart { get; private set; }          // Prefixo ou NCM completo (Ex: "2204")
    public int? SpecificOrigin { get; private set; }               // Origem (0=Nacional, 1=Importação Direta, 2=Adq. Mercado Interno, etc.)

    // --- CAMPOS DE SOBREPOSIÇÃO (Se nulo, herda da regra base) ---
    public string? CfopStateInternal { get; private set; }
    public string? CfopInterstate { get; private set; }

    public string? CstCsosnIcms { get; private set; }
    public int? ModBcIcms { get; private set; }
    public decimal? AliqIcms { get; private set; }
    public decimal? ReducaoBcIcms { get; private set; }

    public int? ModBcIcmsSt { get; private set; }
    public decimal? MvaIcmsSt { get; private set; }
    public decimal? ReducaoBcIcmsSt { get; private set; }
    public decimal? AliqIcmsSt { get; private set; }
    public int? MotivoDesoneracaoIcms { get; private set; }
    public decimal? AliqCreditoSimples { get; private set; }

    public string? CstIpi { get; private set; }
    public int? CodigoEnquadramentoIpi { get; private set; }
    public decimal? AliqIpi { get; private set; }

    public string? CstPis { get; private set; }
    public decimal? AliqPis { get; private set; }

    public string? CstCofins { get; private set; }
    public decimal? AliqCofins { get; private set; }

    public string? CstIbs { get; private set; }
    public decimal? AliqIbs { get; private set; }
    public string? CstCbs { get; private set; }
    public decimal? AliqCbs { get; private set; }
    public string? ClassificacaoTributaria { get; private set; }

    public string? AdditionalNotes { get; private set; }
    public bool IsActive { get; private set; } = true;

    protected FiscalOperationRuleException() { }

    public FiscalOperationRuleException(
        Guid fiscalOperationRuleId,
        string? specificDestinationState,
        string? specificNcmStart,
        int? specificOrigin,
        string? cfopStateInternal,
        string? cfopInterstate,
        string? cstCsosnIcms,
        int? modBcIcms,
        decimal? aliqIcms,
        decimal? reducaoBcIcms,
        int? modBcIcmsSt,
        decimal? mvaIcmsSt,
        decimal? reducaoBcIcmsSt,
        decimal? aliqIcmsSt,
        int? motivoDesoneracaoIcms,
        decimal? aliqCreditoSimples,
        string? cstIpi,
        int? codigoEnquadramentoIpi,
        decimal? aliqIpi,
        string? cstPis,
        decimal? aliqPis,
        string? cstCofins,
        decimal? aliqCofins,
        string? cstIbs,
        decimal? aliqIbs,
        string? cstCbs,
        decimal? aliqCbs,
        string? classificacaoTributaria,
        string? additionalNotes)
    {
        FiscalOperationRuleId = fiscalOperationRuleId;
        SpecificDestinationState = specificDestinationState?.Trim().ToUpper();
        SpecificNcmStart = specificNcmStart?.Trim();
        SpecificOrigin = specificOrigin;

        CfopStateInternal = cfopStateInternal?.Trim();
        CfopInterstate = cfopInterstate?.Trim();
        CstCsosnIcms = cstCsosnIcms?.Trim();
        ModBcIcms = modBcIcms;
        AliqIcms = aliqIcms;
        ReducaoBcIcms = reducaoBcIcms;
        ModBcIcmsSt = modBcIcmsSt;
        MvaIcmsSt = mvaIcmsSt;
        ReducaoBcIcmsSt = reducaoBcIcmsSt;
        AliqIcmsSt = aliqIcmsSt;
        MotivoDesoneracaoIcms = motivoDesoneracaoIcms;
        AliqCreditoSimples = aliqCreditoSimples;
        CstIpi = cstIpi?.Trim();
        CodigoEnquadramentoIpi = codigoEnquadramentoIpi;
        AliqIpi = aliqIpi;
        CstPis = cstPis?.Trim();
        AliqPis = aliqPis;
        CstCofins = cstCofins?.Trim();
        AliqCofins = aliqCofins;
        CstIbs = cstIbs?.Trim();
        AliqIbs = aliqIbs;
        CstCbs = cstCbs?.Trim();
        AliqCbs = aliqCbs;
        ClassificacaoTributaria = classificacaoTributaria?.Trim();
        AdditionalNotes = additionalNotes?.Trim();
        IsActive = true;
    }

    public void ToggleActive()
    {
        IsActive = !IsActive;
        UpdatedAt = DateTime.UtcNow;
    }
}