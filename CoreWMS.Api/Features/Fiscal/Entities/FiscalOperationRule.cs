using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;

namespace CoreWMS.Api.Features.Fiscal.Entities;

public enum FiscalOperationType
{
    OutboundReturnNormal = 1,   // 5906/6906 - Retorno Físico ao Depositante
    OutboundReturnSymbolic = 2, // 5907/6907 - Retorno Simbólico (Venda a terceiro)
    OutboundShipment = 3,       // 5923/6923 - Remessa por Conta e Ordem
    InboundReceipt = 4          // Entrada Simbólica
}

public class FiscalOperationRule : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public string Description { get; private set; } = string.Empty;
    public FiscalOperationType OperationType { get; private set; }

    // DADOS FISCAIS A SEREM APLICADOS
    public string CfopStateInternal { get; private set; } = string.Empty; // Dentro do Estado (Ex: 5906)
    public string CfopInterstate { get; private set; } = string.Empty;    // Fora do Estado (Ex: 6906)

    // Tributação ICMS/PIS/COFINS/IPI
    public string CstCsosnIcms { get; private set; } = "400"; // 400 - Não tributada / 50 - Suspensão
    public string CstPisCofins { get; private set; } = "08";  // 08 - Operação sem incidência
    public string CstIpi { get; private set; } = "53";        // 53 - Saída não tributada

    // --- NOVOS CAMPOS REFORMA TRIBUTÁRIA (2026) ---
    public string? CstIbs { get; private set; }
    public decimal AliqIbs { get; private set; }

    public string? CstCbs { get; private set; }
    public decimal AliqCbs { get; private set; }

    public string? AdditionalNotes { get; private set; }      // Tag <infCpl> (Dados Adicionais)

    // REGRAS DE EXCEÇÃO (Se nulos, funciona como regra geral da Empresa)
    public Guid? SpecificCustomerId { get; private set; }
    public Customer? SpecificCustomer { get; private set; }

    public string? SpecificDestinationState { get; private set; }
    public string? SpecificNcmStart { get; private set; }

    public int Priority { get; private set; } // Define quem ganha se houver conflito (ex: 100 para exceção, 10 para regra geral)
    public bool IsActive { get; private set; } = true;

    protected FiscalOperationRule() { }

    public FiscalOperationRule(
        Guid companyId,
        string description,
        FiscalOperationType operationType,
        string cfopStateInternal,
        string cfopInterstate,
        string cstCsosnIcms,
        string cstPisCofins,
        string cstIpi,
        string? cstIbs,
        decimal aliqIbs,
        string? cstCbs,
        decimal aliqCbs,
        string? additionalNotes,
        Guid? specificCustomerId,
        string? specificDestinationState,
        string? specificNcmStart,
        int priority)
    {
        CompanyId = companyId;
        Description = description.Trim();
        OperationType = operationType;
        CfopStateInternal = cfopStateInternal.Trim();
        CfopInterstate = cfopInterstate.Trim();
        CstCsosnIcms = cstCsosnIcms.Trim();
        CstPisCofins = cstPisCofins.Trim();
        CstIpi = cstIpi.Trim();
        CstIbs = cstIbs?.Trim();
        AliqIbs = aliqIbs;
        CstCbs = cstCbs?.Trim();
        AliqCbs = aliqCbs;
        AdditionalNotes = additionalNotes?.Trim();
        SpecificCustomerId = specificCustomerId;
        SpecificDestinationState = specificDestinationState?.Trim().ToUpper();
        SpecificNcmStart = specificNcmStart?.Trim();
        Priority = priority;
        IsActive = true;
    }

    public void Update(
        string description,
        FiscalOperationType operationType,
        string cfopStateInternal,
        string cfopInterstate,
        string cstCsosnIcms,
        string cstPisCofins,
        string cstIpi,
        string? cstIbs,
        decimal aliqIbs,
        string? cstCbs,
        decimal aliqCbs,
        string? additionalNotes,
        Guid? specificCustomerId,
        string? specificDestinationState,
        string? specificNcmStart,
        int priority)
    {
        Description = description.Trim();
        OperationType = operationType;
        CfopStateInternal = cfopStateInternal.Trim();
        CfopInterstate = cfopInterstate.Trim();
        CstCsosnIcms = cstCsosnIcms.Trim();
        CstPisCofins = cstPisCofins.Trim();
        CstIpi = cstIpi.Trim();
        CstIbs = cstIbs?.Trim();
        AliqIbs = aliqIbs;
        CstCbs = cstCbs?.Trim();
        AliqCbs = aliqCbs;
        AdditionalNotes = additionalNotes?.Trim();
        SpecificCustomerId = specificCustomerId;
        SpecificDestinationState = specificDestinationState?.Trim().ToUpper();
        SpecificNcmStart = specificNcmStart?.Trim();
        Priority = priority;
        UpdatedAt = DateTime.UtcNow;
    }

    public void ToggleActive()
    {
        IsActive = !IsActive;
        UpdatedAt = DateTime.UtcNow;
    }
}