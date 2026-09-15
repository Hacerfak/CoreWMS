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
    public string? CstIbs { get; set; } // Ex: "00" (Tributada)
    public decimal AliqIbs { get; set; } // Ex: 0.10

    public string? CstCbs { get; set; } // Ex: "00" (Tributada)
    public decimal AliqCbs { get; set; } // Ex: 0.90

    public string? AdditionalNotes { get; private set; }      // Tag <infCpl> (Dados Adicionais)

    // REGRAS DE EXCEÇÃO (Se nulos, funciona como regra geral da Empresa)
    public Guid? SpecificCustomerId { get; private set; }
    public Customer? SpecificCustomer { get; private set; }

    public string? SpecificDestinationState { get; private set; }
    public string? SpecificNcmStart { get; private set; }

    public int Priority { get; private set; } // Define quem ganha se houver conflito (100 ganha de 10)
    public bool IsActive { get; private set; } = true;

    protected FiscalOperationRule() { }

    public FiscalOperationRule(Guid companyId, string description, FiscalOperationType operationType, string cfopStateInternal, string cfopInterstate, int priority)
    {
        CompanyId = companyId; Description = description; OperationType = operationType;
        CfopStateInternal = cfopStateInternal; CfopInterstate = cfopInterstate; Priority = priority;
    }
}