using System;
using CoreWMS.Api.Features.Identity.Enums;

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
    int Environment,
    int NfeSerie,
    int NfeNextNumber,
    string? Rntrc,
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
    DateTime CreatedAt,

    // Configurações de E-mail da Empresa
    EmailProviderType EmailProvider,
    string? EmailSenderName,
    string? EmailSenderAddress,
    string? SmtpHost,
    int? SmtpPort,
    string? SmtpUser,
    bool SmtpEnableSsl,
    bool HasSmtpPassword,
    string? GoogleSenderEmail,
    bool HasGoogleOAuthConnected
);