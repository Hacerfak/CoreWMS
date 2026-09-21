namespace CoreWMS.Api.Features.Topology;

public record StorageTypeDto(Guid Id, string Name, int Role, bool AllowMixedProducts, bool AllowMixedBatches, int CapacityStrategy, bool IsActive);
public record WarehouseDto(Guid Id, string Code, string Name, decimal ClearanceHeight, bool IsActive, int TotalBaseCapacity, int TotalEstimatedCapacity);
public record ZoneDto(Guid Id, Guid WarehouseId, string Code, string Name, bool IsActive, int TotalBaseCapacity, int TotalEstimatedCapacity);
public record LocationDto(Guid Id, Guid ZoneId, Guid StorageTypeId, string StorageTypeName, string Code, string FullPath, int BaseCapacity, bool IsActive, int MaxCapacity, decimal ClearanceHeight);