namespace CoreWMS.Api.Features.Inbound;

public record PendingReviewItemDto(Guid ItemId, Guid InboundOrderId, string AccessKey, string IssuerName, int LineNumber, string RawSkuCode, string? RawBarcode, string RawDescription, string RawNcm, decimal ExpectedQuantity, string? ExpectedBatch);

public record ReceiveVolumeDto(Guid PackagingTypeId, int VolumeCount, decimal QuantityPerVolume, string? Batch, DateTime? ManufactureDate, DateTime? ExpirationDate, string? SerialNumber, Guid TargetLocationId, Inventory.Enums.QualityStatus QualityStatus);

public record InboundOrderDto(Guid Id, Guid? CustomerId, string? CustomerName, string IssuerCnpj, string IssuerName, string AccessKey, DateTime IssueDate, string Status);

public record InboundOrderItemDto(Guid Id, Guid? ProductId, int LineNumber, string Sku, string Description, decimal ExpectedQuantity, decimal ReceivedQuantity, string Status, Guid? LockedByUserId);

public record InboundOrderDetailsDto(Guid Id, Guid? CustomerId, string? CustomerName, string IssuerCnpj, string IssuerName, string AccessKey, string RawXml, DateTime IssueDate, string Status, List<InboundOrderItemDto> Items);