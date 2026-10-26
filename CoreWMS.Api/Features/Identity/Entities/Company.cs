using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Enums;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Entities;

public class Company : AuditableEntity
{
    // Identificação Fiscal
    public string Cnpj { get; private set; } = null!;
    public string CorporateName { get; private set; } = null!;
    public string? TradeName { get; private set; }
    public string? StateRegistration { get; private set; }
    public string? MunicipalRegistration { get; private set; }
    public int Crt { get; private set; } = 1;

    // Campos Fiscais / SEFAZ / ANTT
    public string? Cnae { get; private set; }
    public string? Iest { get; private set; }
    public int NfeSerie { get; private set; } = 1;
    public int NfeNextNumber { get; private set; } = 1;
    public string? Rntrc { get; private set; }

    // Contato
    public string? Email { get; private set; }
    public string? Phone { get; private set; }
    public string? LogoBase64 { get; private set; }

    // Endereço
    public string? Street { get; private set; }
    public string? Number { get; private set; }
    public string? Complement { get; private set; }
    public string? Neighborhood { get; private set; }
    public int CityCode { get; private set; }
    public string? CityName { get; private set; }
    public string State { get; private set; } = "RS";
    public string? ZipCode { get; private set; }

    // Certificado Digital
    public byte[]? CertificateBytes { get; private set; }
    public string? CertificatePassword { get; private set; }
    public DateTime? CertificateExpiration { get; private set; }

    // Configurações Fiscais (1 = Produção, 2 = Homologação)
    public int Environment { get; private set; } = 2;
    public bool IsActive { get; private set; } = true;

    // ====================================================================
    // CONFIGURAÇÕES DE ENVIO DE E-MAIL (POR EMPRESA / MULTI-TENANT)
    // ====================================================================
    public EmailProviderType EmailProvider { get; private set; } = EmailProviderType.Disabled;
    public string? EmailSenderName { get; private set; }
    public string? EmailSenderAddress { get; private set; }

    // Provedor 1: SMTP
    public string? SmtpHost { get; private set; }
    public int? SmtpPort { get; private set; } = 587;
    public string? SmtpUser { get; private set; }
    public string? SmtpPassword { get; private set; } // Criptografado
    public bool SmtpEnableSsl { get; private set; } = true;

    // Provedor 2: Google Workspace (OAuth 2.0)
    public string? GoogleSenderEmail { get; private set; }
    public string? GoogleRefreshToken { get; private set; } // Refresh Token criptografado

    protected Company() { }

    public Company(string cnpj, string corporateName, string state)
    {
        Cnpj = cnpj;
        CorporateName = corporateName;
        State = state;
    }

    public void UpdateDetails(
        string corporateName, string? tradeName, string? stateRegistration,
        string? cnae, int crt, string? municipalRegistration, string? iest,
        string? email, string? phone,
        string? zipCode, string? street, string? number, string? complement, string? neighborhood, string? cityName, int cityCode, string state,
        string? logoBase64)
    {
        CorporateName = corporateName;
        TradeName = tradeName;
        StateRegistration = stateRegistration;
        Cnae = cnae;
        Crt = crt;
        MunicipalRegistration = municipalRegistration;
        Iest = iest;
        Email = email;
        Phone = phone;
        ZipCode = zipCode;
        Street = street;
        Number = number;
        Complement = complement;
        Neighborhood = neighborhood;
        CityName = cityName;
        CityCode = cityCode;
        State = state;

        if (logoBase64 != null) LogoBase64 = logoBase64;
    }

    public void UpdateNfeAndTransportDetails(int nfeSerie, int nfeNextNumber, string? rntrc)
    {
        if (nfeSerie < 1) throw new ArgumentException("A série da NF-e deve ser maior ou igual a 1.");
        if (nfeNextNumber < 1) throw new ArgumentException("O número da NF-e deve ser maior ou igual a 1.");

        NfeSerie = nfeSerie;
        NfeNextNumber = nfeNextNumber;
        Rntrc = rntrc;
    }

    public void SetCertificate(byte[] bytes, string password, DateTime expiration)
    {
        CertificateBytes = bytes;
        CertificatePassword = password;
        CertificateExpiration = expiration.Kind == DateTimeKind.Utc ? expiration : expiration.ToUniversalTime();
    }

    public void UpdateEnvironment(int environment) => Environment = environment;

    public void ToggleActive() => IsActive = !IsActive;

    // ====================================================================
    // MÉTODOS DE DOMÍNIO PARA E-MAIL
    // ====================================================================
    public void ConfigureSmtp(
        string? senderName,
        string senderAddress,
        string host,
        int port,
        string user,
        string? rawPassword,
        bool enableSsl)
    {
        if (string.IsNullOrWhiteSpace(senderAddress))
            throw new ArgumentException("O e-mail do remetente é obrigatório.", nameof(senderAddress));
        if (string.IsNullOrWhiteSpace(host))
            throw new ArgumentException("O servidor SMTP (Host) é obrigatório.", nameof(host));
        if (port <= 0)
            throw new ArgumentException("A porta SMTP informada é inválida.", nameof(port));

        EmailProvider = EmailProviderType.Smtp;
        EmailSenderName = string.IsNullOrWhiteSpace(senderName) ? CorporateName : senderName.Trim();
        EmailSenderAddress = senderAddress.Trim();
        SmtpHost = host.Trim();
        SmtpPort = port;
        SmtpUser = user?.Trim();
        SmtpEnableSsl = enableSsl;

        if (!string.IsNullOrWhiteSpace(rawPassword))
        {
            SmtpPassword = CryptoService.Encrypt(rawPassword.Trim());
        }
    }

    public void ConnectGoogleOAuth(string senderEmail, string refreshToken)
    {
        if (string.IsNullOrWhiteSpace(senderEmail))
            throw new ArgumentException("E-mail da conta Google inválido.", nameof(senderEmail));
        if (string.IsNullOrWhiteSpace(refreshToken))
            throw new ArgumentException("Refresh Token do Google inválido.", nameof(refreshToken));

        EmailProvider = EmailProviderType.GoogleWorkspace;
        GoogleSenderEmail = senderEmail.Trim();
        GoogleRefreshToken = CryptoService.Encrypt(refreshToken.Trim());
        EmailSenderAddress = senderEmail.Trim();
        EmailSenderName ??= CorporateName;
    }

    public void DisconnectGoogleOAuth()
    {
        GoogleRefreshToken = null;
        GoogleSenderEmail = null;
        if (EmailProvider == EmailProviderType.GoogleWorkspace)
        {
            EmailProvider = EmailProviderType.Disabled;
        }
    }

    public void DisableEmailProvider()
    {
        EmailProvider = EmailProviderType.Disabled;
    }
}