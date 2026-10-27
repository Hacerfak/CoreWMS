using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Yard.Entities;
using CoreWMS.Api.Features.Inbound.Enums;

namespace CoreWMS.Api.Features.Inbound.Entities;

public class InboundOrder : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public Guid? CustomerId { get; private set; }
    public Customer? Customer { get; private set; }

    public string IssuerCnpj { get; private set; } = string.Empty;
    public string IssuerName { get; private set; } = string.Empty;
    public string AccessKey { get; private set; } = string.Empty;
    public string? InvoiceNumber { get; private set; }
    public string? InvoiceSerie { get; private set; }
    public string RawXml { get; private set; } = string.Empty;
    public DateTime IssueDate { get; private set; }

    public InboundOrderStatus Status { get; private set; }

    public int? LastSefazManifestType { get; private set; }
    public string? SefazManifestProtocol { get; private set; }
    public DateTime? SefazManifestDate { get; private set; }
    public string? SefazManifestJustification { get; private set; }

    private readonly List<InboundOrderItem> _items = new();
    public IReadOnlyCollection<InboundOrderItem> Items => _items.AsReadOnly();

    public Guid? YardAppointmentId { get; private set; }
    public YardAppointment? YardAppointment { get; private set; }

    protected InboundOrder() { }

    public InboundOrder(
        Guid companyId,
        Guid? customerId,
        string issuerCnpj,
        string issuerName,
        string accessKey,
        string rawXml,
        DateTime issueDate,
        string? invoiceNumber = null,
        string? invoiceSerie = null)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        IssuerCnpj = issuerCnpj;
        IssuerName = issuerName;
        AccessKey = accessKey;
        RawXml = rawXml;
        IssueDate = issueDate.ToUniversalTime();
        Status = InboundOrderStatus.Pending;

        // Se o número da nota não for informado explicitamente, extrai da chave de 44 dígitos
        if (!string.IsNullOrWhiteSpace(invoiceNumber))
        {
            InvoiceNumber = invoiceNumber.Trim();
        }
        else if (accessKey.Length == 44 && long.TryParse(accessKey.Substring(25, 9), out var nNfVal))
        {
            InvoiceNumber = nNfVal.ToString();
        }

        if (!string.IsNullOrWhiteSpace(invoiceSerie))
        {
            InvoiceSerie = invoiceSerie.Trim();
        }
        else if (accessKey.Length == 44 && int.TryParse(accessKey.Substring(22, 3), out var serieVal))
        {
            InvoiceSerie = serieVal.ToString();
        }
    }

    public void SetInvoiceDetails(string invoiceNumber, string? invoiceSerie)
    {
        InvoiceNumber = invoiceNumber?.Trim();
        InvoiceSerie = invoiceSerie?.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public void LinkCustomer(Guid customerId)
    {
        if (CustomerId.HasValue && CustomerId.Value != customerId)
            throw new InvalidOperationException("Esta ordem já está vinculada a outro Depositante.");

        CustomerId = customerId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateStatus(InboundOrderStatus newStatus)
    {
        Status = newStatus;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UpdateSefazManifestStatus(int manifestType, string? protocol, DateTime? eventDate, string? justification = null)
    {
        LastSefazManifestType = manifestType;
        SefazManifestProtocol = protocol;
        SefazManifestDate = eventDate?.ToUniversalTime();
        SefazManifestJustification = string.IsNullOrWhiteSpace(justification) ? null : justification.Trim();
        UpdatedAt = DateTime.UtcNow;
    }

    public string GetSefazManifestDescription()
    {
        return LastSefazManifestType switch
        {
            210200 => "Confirmação da Operação",
            210210 => "Ciência da Operação",
            210220 => "Desconhecimento da Operação",
            210240 => "Operação Não Realizada",
            _ => "Sem Manifestação"
        };
    }

    public void LinkYardAppointment(Guid appointmentId)
    {
        YardAppointmentId = appointmentId;
        UpdatedAt = DateTime.UtcNow;
    }

    public void UnlinkYardAppointment()
    {
        YardAppointmentId = null;
        UpdatedAt = DateTime.UtcNow;
    }
}