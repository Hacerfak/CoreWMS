namespace CoreWMS.Api.Infrastructure.Fiscal.Models;

public record SefazCompanyDataDto(
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    int Crt,
    string? Cnae,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    DateTime CertificateExpiration
);