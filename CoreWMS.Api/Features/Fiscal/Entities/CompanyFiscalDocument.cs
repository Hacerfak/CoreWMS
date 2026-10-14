using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Entities;

namespace CoreWMS.Api.Features.Fiscal.Entities;

public enum FiscalDocumentType
{
    // --- FINALIDADES OFICIAIS SEFAZ (tag <finNFe>) ---
    Normal = 1,          // 1 = NF-e normal
    Complementar = 2,    // 2 = NF-e complementar
    Ajuste = 3,          // 3 = NF-e de ajuste
    Devolucao = 4,       // 4 = Devolução de mercadoria / Retorno
    NotaCredito = 5,     // 5 = Nota de Crédito (Reforma Tributária - IBS/CBS)
    NotaDebito = 6,      // 6 = Nota de Débito (Reforma Tributária - IBS/CBS)

    // --- EVENTOS FISCAIS SEFAZ ---
    Cancelamento = 7,    // Evento Cancelamento (tpEvento 110111)
    CartaCorrecao = 8    // Evento Carta de Correção - CC-e (tpEvento 110110)
}

public enum FiscalDocumentStatus
{
    Pending = 1,
    Authorized = 2,
    Rejected = 3,
    Canceled = 4
}

public class CompanyFiscalDocument : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    // Opcional: nulo quando for emissão de nota avulsa
    public Guid? OutboundOrderId { get; private set; }
    public OutboundOrder? OutboundOrder { get; private set; }

    public FiscalDocumentType Type { get; private set; }
    public FiscalDocumentStatus Status { get; private set; }

    public string? AccessKey { get; private set; }
    public string? Protocol { get; private set; }
    public string? ReturnMessage { get; private set; }

    public string? RawXml { get; private set; }

    // --- PROPRIEDADES E MÉTODOS DE IDENTIFICAÇÃO DIRETO NA ENTIDADE ---
    public bool IsNfe => Type.IsNfe();
    public bool IsEvent => Type.IsEvent();

    protected CompanyFiscalDocument() { }

    public CompanyFiscalDocument(Guid companyId, FiscalDocumentType type, Guid? outboundOrderId = null)
    {
        CompanyId = companyId;
        Type = type;
        OutboundOrderId = outboundOrderId;
        Status = FiscalDocumentStatus.Pending;
    }

    public CompanyFiscalDocument(Guid companyId, Guid outboundOrderId, FiscalDocumentType type)
        : this(companyId, type, outboundOrderId)
    {
    }

    public void MarkAsAuthorized(string accessKey, string protocol, string rawXml, string message)
    {
        Status = FiscalDocumentStatus.Authorized;
        AccessKey = accessKey?.Trim();
        Protocol = protocol?.Trim();
        RawXml = rawXml;
        ReturnMessage = message?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void MarkAsRejected(string message)
    {
        Status = FiscalDocumentStatus.Rejected;
        ReturnMessage = message?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void MarkAsCanceled(string message)
    {
        Status = FiscalDocumentStatus.Canceled;
        ReturnMessage = message?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }
}

public static class FiscalDocumentTypeExtensions
{
    /// <summary>
    /// Retorna verdadeiro para qualquer uma das finalidades de NF-e (1 a 6)
    /// </summary>
    public static bool IsNfe(this FiscalDocumentType type) =>
        type is FiscalDocumentType.Normal
             or FiscalDocumentType.Complementar
             or FiscalDocumentType.Ajuste
             or FiscalDocumentType.Devolucao
             or FiscalDocumentType.NotaCredito
             or FiscalDocumentType.NotaDebito;

    /// <summary>
    /// Retorna verdadeiro para eventos vinculados à NF-e (Cancelamento ou CC-e)
    /// </summary>
    public static bool IsEvent(this FiscalDocumentType type) =>
        type is FiscalDocumentType.Cancelamento or FiscalDocumentType.CartaCorrecao;
}