using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Outbound.Entities;

namespace CoreWMS.Api.Features.Fiscal.Entities;

public enum FiscalDocumentType
{
    NfeReturn = 1,      // Retorno Simbólico / Físico
    NfeShipment = 2,    // Remessa por Conta e Ordem
    Cancelation = 3,    // Evento de Cancelamento
    Correction = 4      // Carta de Correção (CC-e)
}

public enum FiscalDocumentStatus
{
    Pending = 1,
    Authorized = 2,
    Rejected = 3,
    Canceled = 4
}

public class OutboundFiscalDocument : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    public FiscalDocumentType Type { get; private set; }
    public FiscalDocumentStatus Status { get; private set; }

    public string? AccessKey { get; private set; }
    public string? Protocol { get; private set; }
    public string? ReturnMessage { get; private set; } // O xMotivo da Sefaz

    // Gravação do XML longo (PostgreSQL text)
    public string? RawXml { get; private set; }

    protected OutboundFiscalDocument() { }

    public OutboundFiscalDocument(Guid outboundOrderId, FiscalDocumentType type)
    {
        OutboundOrderId = outboundOrderId;
        Type = type;
        Status = FiscalDocumentStatus.Pending;
    }

    public void MarkAsAuthorized(string accessKey, string protocol, string rawXml, string message)
    {
        Status = FiscalDocumentStatus.Authorized;
        AccessKey = accessKey;
        Protocol = protocol;
        RawXml = rawXml;
        ReturnMessage = message;
        UpdatedAt = DateTime.UtcNow;
    }

    public void MarkAsRejected(string message)
    {
        Status = FiscalDocumentStatus.Rejected;
        ReturnMessage = message;
        UpdatedAt = DateTime.UtcNow;
    }
}