using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;

namespace CoreWMS.Api.Features.Fiscal.Entities;

public class FiscalOperationRule : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public string Description { get; private set; } = string.Empty; // Nome da Natureza (Ex: "Retorno de Armazém Geral")
    public FiscalDocumentType Finalidade { get; private set; } = FiscalDocumentType.Normal; // Espelha finNFe da SEFAZ
    public bool IsActive { get; private set; } = true;

    // --- CFOPS PADRÃO ---
    public string CfopStateInternal { get; private set; } = string.Empty; // Dentro do Estado (Ex: 5906)
    public string CfopInterstate { get; private set; } = string.Empty;    // Fora do Estado (Ex: 6906)

    // --- ICMS PADRÃO ---
    public string CstCsosnIcms { get; private set; } = "400"; // CST (00, 20, 40, 41, 50, 90) ou CSOSN (102, 300, 400, 900)
    public int ModBcIcms { get; private set; } = 3;           // 0=MVA, 1=Pauta, 2=Preço Tabelado, 3=Valor da Operação
    public decimal AliqIcms { get; private set; }
    public decimal ReducaoBcIcms { get; private set; }

    // ICMS ST & Desoneração
    public int ModBcIcmsSt { get; private set; } = 4;         // 4=MVA, 5=Pauta
    public decimal MvaIcmsSt { get; private set; }
    public decimal ReducaoBcIcmsSt { get; private set; }
    public decimal AliqIcmsSt { get; private set; }
    public int? MotivoDesoneracaoIcms { get; private set; }
    public decimal AliqCreditoSimples { get; private set; }   // pCredSN (CSOSN 101/201)

    // --- IPI PADRÃO ---
    public string CstIpi { get; private set; } = "53";        // 53=Não tributado, 50=Tributado, 99=Outras
    public int CodigoEnquadramentoIpi { get; private set; } = 999;
    public decimal AliqIpi { get; private set; }

    // --- PIS PADRÃO ---
    public string CstPis { get; private set; } = "08";        // 08=Sem incidência, 01=Tributado, 07=Isento
    public decimal AliqPis { get; private set; }

    // --- COFINS PADRÃO ---
    public string CstCofins { get; private set; } = "08";     // 08=Sem incidência, 01=Tributado, 07=Isento
    public decimal AliqCofins { get; private set; }

    // --- REFORMA TRIBUTÁRIA (2026 - IBS e CBS) PADRÃO ---
    public string? CstIbs { get; private set; } = "410";
    public decimal AliqIbs { get; private set; } = 0.10m;
    public string? CstCbs { get; private set; } = "410";
    public decimal AliqCbs { get; private set; } = 0.90m;
    public string? ClassificacaoTributaria { get; private set; } = "410999";

    // --- DADOS ADICIONAIS ---
    public string? AdditionalNotes { get; private set; }      // Tag <infCpl>

    // --- COLEÇÃO DE LINHAS DE EXCEÇÃO ---
    public ICollection<FiscalOperationRuleException> Exceptions { get; private set; } = new List<FiscalOperationRuleException>();

    protected FiscalOperationRule() { }

    public FiscalOperationRule(
        Guid companyId,
        string description,
        FiscalDocumentType finalidade,
        string cfopStateInternal,
        string cfopInterstate,
        string cstCsosnIcms,
        int modBcIcms,
        decimal aliqIcms,
        decimal reducaoBcIcms,
        int modBcIcmsSt,
        decimal mvaIcmsSt,
        decimal reducaoBcIcmsSt,
        decimal aliqIcmsSt,
        int? motivoDesoneracaoIcms,
        decimal aliqCreditoSimples,
        string cstIpi,
        int codigoEnquadramentoIpi,
        decimal aliqIpi,
        string cstPis,
        decimal aliqPis,
        string cstCofins,
        decimal aliqCofins,
        string? cstIbs,
        decimal aliqIbs,
        string? cstCbs,
        decimal aliqCbs,
        string? classificacaoTributaria,
        string? additionalNotes)
    {
        CompanyId = companyId;
        Description = description.Trim();
        Finalidade = finalidade;
        CfopStateInternal = cfopStateInternal.Trim();
        CfopInterstate = cfopInterstate.Trim();
        CstCsosnIcms = cstCsosnIcms.Trim();
        ModBcIcms = modBcIcms;
        AliqIcms = aliqIcms;
        ReducaoBcIcms = reducaoBcIcms;
        ModBcIcmsSt = modBcIcmsSt;
        MvaIcmsSt = mvaIcmsSt;
        ReducaoBcIcmsSt = reducaoBcIcmsSt;
        AliqIcmsSt = aliqIcmsSt;
        MotivoDesoneracaoIcms = motivoDesoneracaoIcms;
        AliqCreditoSimples = aliqCreditoSimples;
        CstIpi = cstIpi.Trim();
        CodigoEnquadramentoIpi = codigoEnquadramentoIpi > 0 ? codigoEnquadramentoIpi : 999;
        AliqIpi = aliqIpi;
        CstPis = cstPis.Trim();
        AliqPis = aliqPis;
        CstCofins = cstCofins.Trim();
        AliqCofins = aliqCofins;
        CstIbs = cstIbs?.Trim();
        AliqIbs = aliqIbs;
        CstCbs = cstCbs?.Trim();
        AliqCbs = aliqCbs;
        ClassificacaoTributaria = classificacaoTributaria?.Trim();
        AdditionalNotes = additionalNotes?.Trim();
        IsActive = true;
    }

    public void Update(
        string description,
        FiscalDocumentType finalidade,
        string cfopStateInternal,
        string cfopInterstate,
        string cstCsosnIcms,
        int modBcIcms,
        decimal aliqIcms,
        decimal reducaoBcIcms,
        int modBcIcmsSt,
        decimal mvaIcmsSt,
        decimal reducaoBcIcmsSt,
        decimal aliqIcmsSt,
        int? motivoDesoneracaoIcms,
        decimal aliqCreditoSimples,
        string cstIpi,
        int codigoEnquadramentoIpi,
        decimal aliqIpi,
        string cstPis,
        decimal aliqPis,
        string cstCofins,
        decimal aliqCofins,
        string? cstIbs,
        decimal aliqIbs,
        string? cstCbs,
        decimal aliqCbs,
        string? classificacaoTributaria,
        string? additionalNotes)
    {
        Description = description.Trim();
        Finalidade = finalidade;
        CfopStateInternal = cfopStateInternal.Trim();
        CfopInterstate = cfopInterstate.Trim();
        CstCsosnIcms = cstCsosnIcms.Trim();
        ModBcIcms = modBcIcms;
        AliqIcms = aliqIcms;
        ReducaoBcIcms = reducaoBcIcms;
        ModBcIcmsSt = modBcIcmsSt;
        MvaIcmsSt = mvaIcmsSt;
        ReducaoBcIcmsSt = reducaoBcIcmsSt;
        AliqIcmsSt = aliqIcmsSt;
        MotivoDesoneracaoIcms = motivoDesoneracaoIcms;
        AliqCreditoSimples = aliqCreditoSimples;
        CstIpi = cstIpi.Trim();
        CodigoEnquadramentoIpi = codigoEnquadramentoIpi > 0 ? codigoEnquadramentoIpi : 999;
        AliqIpi = aliqIpi;
        CstPis = cstPis.Trim();
        AliqPis = aliqPis;
        CstCofins = cstCofins.Trim();
        AliqCofins = aliqCofins;
        CstIbs = cstIbs?.Trim();
        AliqIbs = aliqIbs;
        CstCbs = cstCbs?.Trim();
        AliqCbs = aliqCbs;
        ClassificacaoTributaria = classificacaoTributaria?.Trim();
        AdditionalNotes = additionalNotes?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void ToggleActive()
    {
        IsActive = !IsActive;
        UpdatedAt = DateTime.UtcNow;
    }
}