namespace CoreWMS.Api.Infrastructure.Fiscal.NfeParser;

public record NfeParsedItem(
    int LineNumber,
    string SkuCode,
    string? Barcode,
    string Description,
    string Ncm,
    string? Cest,
    string Unit,
    decimal Quantity,
    decimal UnitValue,
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate
);

public record NfeParsedIssuer(
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    string? MunicipalRegistration,
    int? Crt,
    string? Cnae,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int? CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    string? Phone
);

public record NfeParsedRecipient(
    string CnpjCpf,
    string Name,
    string? StateRegistration,
    int IeIndicator,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string CityName,
    string State,
    string? ZipCode
);

public record NfeParsedData(
    string AccessKey,
    DateTime IssueDate,
    string IssuerCnpj,
    string IssuerName,
    NfeParsedIssuer Issuer,
    NfeParsedRecipient Recipient,
    int FreightModality,
    string? CarrierCnpjCpf,
    string? CarrierName,
    string? CarrierIe,
    string? CarrierAddress,
    string? CarrierCity,
    string? CarrierState,
    string? VehiclePlate,
    string? VehiclePlateState,
    List<NfeParsedItem> Items,
    decimal? TotalNetWeight = null,
    decimal? TotalGrossWeight = null,
    int? TotalVolumes = null,
    string? VolumeSpecies = null,
    string? InvoiceNumber = null,
    string? InvoiceSerie = null
);