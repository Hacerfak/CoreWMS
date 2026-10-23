using CoreWMS.Api.Core.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Outbound.Entities;

public enum CheckCodeType
{
    HandlingUnitLpn = 1,     // Bipagem de volume fechado (LPN da HU)
    ShippingVolumeLpn = 2,   // Bipagem da etiqueta de volume de envio (VOL-...)
    ProductSkuBarcode = 3    // Bipagem direta do SKU ou código de barras da peça
}

public class OutboundCheckLog : AuditableEntity
{
    public Guid OutboundOrderId { get; private set; }
    public OutboundOrder OutboundOrder { get; private set; } = null!;

    public Guid OutboundOrderItemId { get; private set; }
    public OutboundOrderItem OutboundOrderItem { get; private set; } = null!;

    public Guid? HandlingUnitId { get; private set; }
    public Guid? OutboundVolumeId { get; private set; }

    public string ScannedCode { get; private set; } = string.Empty;
    public CheckCodeType CodeType { get; private set; }
    public decimal Quantity { get; private set; }

    // Rastreabilidade nominal do conferente
    public Guid CheckedByUserId { get; private set; }
    public string CheckedByName { get; private set; } = string.Empty;

    protected OutboundCheckLog() { }

    public OutboundCheckLog(
        Guid outboundOrderId,
        Guid outboundOrderItemId,
        string scannedCode,
        CheckCodeType codeType,
        decimal quantity,
        Guid checkedByUserId,
        string checkedByName,
        Guid? handlingUnitId = null,
        Guid? outboundVolumeId = null)
    {
        if (quantity <= 0)
            throw new ArgumentException("A quantidade conferida deve ser maior que zero.", nameof(quantity));

        Id = FastGuid.NewPostgreSqlGuid();
        OutboundOrderId = outboundOrderId;
        OutboundOrderItemId = outboundOrderItemId;
        ScannedCode = scannedCode.Trim().ToUpper();
        CodeType = codeType;
        Quantity = quantity;
        CheckedByUserId = checkedByUserId;
        CheckedByName = checkedByName.Trim();
        HandlingUnitId = handlingUnitId;
        OutboundVolumeId = outboundVolumeId;
    }
}