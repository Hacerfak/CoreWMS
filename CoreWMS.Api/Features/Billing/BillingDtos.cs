namespace CoreWMS.Api.Features.Billing;

public record BillingServiceDto(Guid Id, string Name, string Type, string? SqlTemplate);

public record CustomerTariffDto(Guid Id, Guid CustomerId, string CustomerName, Guid BillingServiceId, string ServiceName, decimal UnitValue, DateTime ValidFrom, DateTime? ValidTo);

public record BillingCycleDto(Guid Id, string ReferenceMonth, DateTime StartDate, DateTime EndDate, string Status, decimal TotalAmount);