using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Outbound.Entities;

namespace CoreWMS.Api.Features.Fiscal.Entities;

public enum FiscalDocumentType
{
    Normal = 1,
    Complementar = 2,
    Ajuste = 3,
    Devolucao = 4,
    NotaCredito = 5,
    NotaDebito = 6,
    Cancelamento = 7,
    CartaCorrecao = 8
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
    public Guid? OutboundOrderId { get; private set; }
    public OutboundOrder? OutboundOrder { get; private set; }
    public FiscalDocumentType Type { get; private set; }
    public FiscalDocumentStatus Status { get; private set; }
    public string? AccessKey { get; private set; }
    public string? Protocol { get; private set; }
    public string? ReturnMessage { get; private set; }
    public string? RawXml { get; private set; }
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

    public void SetTransmittedXml(string accessKey, string rawXml)
    {
        AccessKey = accessKey?.Trim();
        RawXml = rawXml;
        UpdatedAt = DateTime.UtcNow;
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

    public void MarkAsRejected(string message, string? accessKey = null, string? rawXml = null)
    {
        Status = FiscalDocumentStatus.Rejected;
        ReturnMessage = message?.Trim();
        if (!string.IsNullOrWhiteSpace(accessKey)) AccessKey = accessKey.Trim();
        if (!string.IsNullOrWhiteSpace(rawXml)) RawXml = rawXml;
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
    public static bool IsNfe(this FiscalDocumentType type) =>
        type is FiscalDocumentType.Normal
             or FiscalDocumentType.Complementar
             or FiscalDocumentType.Ajuste
             or FiscalDocumentType.Devolucao
             or FiscalDocumentType.NotaCredito
             or FiscalDocumentType.NotaDebito;

    public static bool IsEvent(this FiscalDocumentType type) =>
        type is FiscalDocumentType.Cancelamento or FiscalDocumentType.CartaCorrecao;
}