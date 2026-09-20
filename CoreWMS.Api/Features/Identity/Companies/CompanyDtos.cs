using System;

namespace CoreWMS.Api.Features.Identity.Companies;

public record CompanyDto(
    Guid Id,
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    string? MunicipalRegistration,
    string? Iest,
    string? Cnae,
    int Crt,
    string? Email,
    string? Phone,
    string? ZipCode,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    string? CityName,
    int CityCode,
    string State,
    string? LogoBase64,
    DateTime? CertificateExpiration,
    bool IsActive,
    DateTime CreatedAt
);