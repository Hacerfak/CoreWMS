using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Products.Entities;
using CoreWMS.Api.Features.Topology.Entities;

namespace CoreWMS.Api.Features.Inventory.Entities;

public class HandlingUnit : AuditableEntity
{
    public string Lpn { get; private set; } = string.Empty;
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;
    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;
    public Guid PackagingTypeId { get; private set; }
    public PackagingType PackagingType { get; private set; } = null!;
    public Guid? CurrentLocationId { get; private set; }
    public Location? CurrentLocation { get; private set; }
    public Guid? ReceiptDocumentId { get; private set; }

    public string? Batch { get; private set; }
    public DateTime? ManufactureDate { get; private set; }
    public DateTime? ExpirationDate { get; private set; }
    public string? SerialNumber { get; private set; }

    public decimal InitialQuantity { get; private set; }
    public decimal CurrentQuantity { get; private set; }
    public decimal UnitValue { get; private set; }

    public HuStatus Status { get; private set; }
    public QualityStatus QualityStatus { get; private set; }

    // Trava de Concorrência Otimista (Anti-Race Condition)
    public Guid Version { get; private set; } = Guid.NewGuid();

    protected HandlingUnit() { }

    public HandlingUnit(string lpn, Guid companyId, Guid customerId, Guid productId, Guid packagingTypeId, Guid? receiptDocumentId, string? batch, DateTime? mfgDate, DateTime? expDate, string? serialNumber, decimal initialQuantity, decimal unitValue)
    {
        Lpn = lpn.ToUpper().Trim(); CompanyId = companyId; CustomerId = customerId; ProductId = productId; PackagingTypeId = packagingTypeId; ReceiptDocumentId = receiptDocumentId; Batch = batch?.ToUpper().Trim(); ManufactureDate = mfgDate; ExpirationDate = expDate; SerialNumber = serialNumber?.ToUpper().Trim(); InitialQuantity = initialQuantity; CurrentQuantity = initialQuantity; UnitValue = unitValue;
        Status = HuStatus.Expected; QualityStatus = QualityStatus.Available;
    }

    public void ReceiveAtDock(Guid dockLocationId)
    {
        CurrentLocationId = dockLocationId;
        Status = HuStatus.Received;
        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void MoveTo(Guid newLocationId)
    {
        CurrentLocationId = newLocationId;
        if (Status == HuStatus.Received || Status == HuStatus.Picking) Status = HuStatus.Stored;
        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void ChangeQuality(QualityStatus newStatus)
    {
        QualityStatus = newStatus;
        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void Consume(decimal quantityToConsume)
    {
        if (quantityToConsume > CurrentQuantity) throw new InvalidOperationException($"Saldo insuficiente na HU {Lpn}. Tentativa: {quantityToConsume}, Disponível: {CurrentQuantity}");

        CurrentQuantity -= quantityToConsume;
        if (CurrentQuantity == 0)
        {
            Status = HuStatus.Consumed;
            CurrentLocationId = null;
        }

        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid();
    }

    public void UpdateTraceability(string? batch, DateTime? mfgDate, DateTime? expDate, string? serialNumber)
    {
        Batch = batch?.ToUpper().Trim();
        ManufactureDate = mfgDate;
        ExpirationDate = expDate;
        SerialNumber = serialNumber?.ToUpper().Trim();

        UpdatedAt = DateTime.UtcNow;
        Version = Guid.NewGuid(); // Dispara a trava de concorrência
    }
}