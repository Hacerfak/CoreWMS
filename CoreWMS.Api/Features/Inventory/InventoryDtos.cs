namespace CoreWMS.Api.Features.Inventory;

public record HandlingUnitDto(
    Guid Id,
    string Lpn,
    string CustomerName,
    string ProductSku,
    string ProductDescription,
    string Unit,
    string PackagingTypeCode,
    Guid? CurrentLocationId,
    string? LocationPath,
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate,
    string? SerialNumber,
    decimal InitialQuantity,
    decimal CurrentQuantity,
    decimal UnitValue,
    decimal TotalValue,
    string Status,
    string QualityStatus,
    Guid? ReceiptDocumentId,
    DateTime CreatedAt,
    string? NfeNumber,
    string? NfeSeries,
    string? AccessKey
);

public record InventoryBalanceDto(
    Guid ProductId,
    string ProductSku,
    string CustomerName,
    decimal TotalExpected,
    decimal TotalDock,
    decimal TotalAvailable,
    decimal TotalAllocated,
    decimal TotalQuarantine,
    decimal TotalPhysical
);

public record InventoryTransactionDto(
    Guid Id,
    DateTime CreatedAt,
    string ProductSku,
    string? Lpn,
    string Type,
    decimal QuantityChange,
    decimal BalanceAfter,
    string? SourceDocumentNumber
);