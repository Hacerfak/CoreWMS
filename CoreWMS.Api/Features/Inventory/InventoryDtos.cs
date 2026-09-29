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
    string ProductDescription,
    string CustomerName,
    decimal TotalExpected,
    decimal TotalDock,
    decimal TotalAvailable,
    decimal TotalAllocated,
    decimal TotalQuarantine,
    decimal TotalPhysical
);

public record InventoryBalanceResponse(
    List<InventoryBalanceDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    decimal TotalPhysical,
    decimal TotalExpected,
    decimal TotalDock,
    decimal TotalAvailable,
    decimal TotalAllocated,
    decimal TotalQuarantine
);

public record KardexTransactionDto(
    Guid Id,
    DateTime CreatedAt,
    string CustomerName,
    string ProductSku,
    string ProductDescription,
    string? Lpn,
    string? Batch,
    DateTime? ExpirationDate,
    string Type,
    decimal QuantityChange,
    decimal BalanceAfter,
    string? LocationPath,
    string? SourceDocumentNumber
);

public record KardexResponse(
    List<KardexTransactionDto> Items,
    int TotalCount,
    int Page,
    int PageSize,
    decimal TotalInputs,
    decimal TotalOutputs,
    decimal NetChange
);