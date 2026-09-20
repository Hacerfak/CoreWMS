namespace CoreWMS.Api.Features.Customers;

public record CustomerDto(
    Guid Id, Guid CompanyId, string Cnpj, string CorporateName, string? TradeName, string? StateRegistration, int IeIndicator, string? MunicipalRegistration,
    int Crt, string? Cnae, string? Street, string? Number, string? Complement, string? Neighborhood, int CityCode, string? CityName, string State, string? ZipCode, string? Email, string? Phone,
    bool TracksBatch, bool StrictBatch, bool TracksManufacture, bool StrictManufacture, bool TracksExpiration, bool StrictExpiration, bool TracksSerial, bool StrictSerial,
    int DefaultPickingStrategy, int DefaultPickingBaseDate,
    int? MaxDailyInboundOrders, int? MaxDailyOutboundOrders, int? MinStockVolume, int? MaxStockVolume,
    bool RequiresBlindInbound, bool RequiresBlindOutbound, bool ReturnInvoicePerReferencedInvoice,
    bool IsActive);