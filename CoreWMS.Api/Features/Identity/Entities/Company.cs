using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class Company : AuditableEntity
{
    // Identificação Fiscal[cite: 4]
    public string Cnpj { get; private set; } = null!;
    public string CorporateName { get; private set; } = null!;
    public string? TradeName { get; private set; }
    public string? StateRegistration { get; private set; }
    public string? MunicipalRegistration { get; private set; }
    public int Crt { get; private set; } = 1;

    // Novos Campos Fiscais / SEFAZ
    public string? Cnae { get; private set; }
    public string? Iest { get; private set; } // Inscrição Estadual ST

    // Contato
    public string? Email { get; private set; }
    public string? Phone { get; private set; }
    public string? LogoBase64 { get; private set; }

    // Endereço[cite: 4]
    public string? Street { get; private set; }
    public string? Number { get; private set; }
    public string? Complement { get; private set; }
    public string? Neighborhood { get; private set; }
    public int CityCode { get; private set; }
    public string? CityName { get; private set; }
    public string State { get; private set; } = "RS";
    public string? ZipCode { get; private set; }

    // Certificado Digital[cite: 4]
    public byte[]? CertificateBytes { get; private set; }
    public string? CertificatePassword { get; private set; }
    public DateTime? CertificateExpiration { get; private set; }

    // Configurações[cite: 4]
    public int Environment { get; private set; } = 2;
    public bool IsActive { get; private set; } = true;

    protected Company() { }

    public Company(string cnpj, string corporateName, string state)
    {
        Cnpj = cnpj;
        CorporateName = corporateName;
        State = state;
    }

    // Mantido intacto para o seu CreateCompanyHandler[cite: 4, 5]
    public void UpdateFiscalData(string corporateName, string? tradeName, string? stateRegistration, string? municipalRegistration, int crt, string? street, string? number, string? complement, string? neighborhood, int cityCode, string? cityName, string state, string? zipCode)
    {
        CorporateName = corporateName;
        TradeName = tradeName;
        StateRegistration = stateRegistration;
        MunicipalRegistration = municipalRegistration;
        Crt = crt;
        Street = street;
        Number = number;
        Complement = complement;
        Neighborhood = neighborhood;
        CityCode = cityCode;
        CityName = cityName;
        State = state;
        ZipCode = zipCode;
    }

    // NOVO: Atualização de todos os campos via painel
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

    public void SetCertificate(byte[] bytes, string password, DateTime expiration)
    {
        CertificateBytes = bytes;
        CertificatePassword = password;
        CertificateExpiration = expiration.Kind == DateTimeKind.Utc ? expiration : expiration.ToUniversalTime();
    }

    public void UpdateEnvironment(int environment) => Environment = environment;
}