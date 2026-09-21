namespace CoreWMS.Api.Features.Outbound;

public record OutboundOrderItemDto(Guid Id, Guid ProductId, int LineNumber, string SkuCode, decimal ExpectedQuantity, decimal AllocatedQuantity, decimal PickedQuantity, decimal PackedQuantity, decimal UnitValue, string Status);

public record OutboundOrderDto(Guid Id, Guid CustomerId, string OrderNumber, string DestinationName, string DestinationCity, string DestinationState, DateTime IssueDate, string Status, int ItemsCount);

public record OutboundOrderDetailsDto(Guid Id, Guid CustomerId, string OrderNumber, string? AccessKey, string DestinationCnpjCpf, string DestinationName, string DestinationCity, string DestinationState, string? DestinationZipCode, DateTime IssueDate, DateTime? ExpectedShipDate, string Status, Guid? DockLocationId, List<OutboundOrderItemDto> Items);

public record PickingTaskDto(Guid AllocationId, Guid ItemId, string SkuCode, string Description, string LocationPath, string ExpectedLpn, string? Batch, DateTime? ExpirationDate, decimal QuantityToPick, bool IsPicked);

public record CreateOutboundOrderItemCommand(Guid ProductId, int LineNumber, decimal Quantity, decimal UnitValue);