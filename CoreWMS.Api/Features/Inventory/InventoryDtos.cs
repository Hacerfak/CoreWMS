namespace CoreWMS.Api.Features.Inventory;

public record HandlingUnitDto(Guid Id, string Lpn, string CustomerName, string ProductSku, string PackagingTypeCode, Guid? CurrentLocationId, string? LocationPath, string? Batch, DateTime? ManufactureDate, DateTime? ExpirationDate, string? SerialNumber, decimal InitialQuantity, decimal CurrentQuantity, string Status, string QualityStatus);

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

public record InventoryTransactionDto(Guid Id, DateTime CreatedAt, string ProductSku, string? Lpn, string Type, decimal QuantityChange, decimal BalanceAfter, string? SourceDocumentNumber);