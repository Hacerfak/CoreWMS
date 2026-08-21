using CoreWMS.Api.Core.Entities;

namespace CoreWMS.Api.Features.Identity.Entities;

public class Company : AuditableEntity
{
    // Identificação Fiscal
    public string Cnpj { get; private set; } = null!;
    public string CorporateName { get; private set; } = null!; // Razão Social
    public string? TradeName { get; private set; } // Nome Fantasia
    public string? StateRegistration { get; private set; } // Inscrição Estadual (IE)
    public string? MunicipalRegistration { get; private set; } // Inscrição Municipal (IM)
    public int Crt { get; private set; } = 1; // 1 = Simples Nacional, 3 = Regime Normal

    // Endereço (Retornado pela SEFAZ / IBGE)
    public string? Street { get; private set; }
    public string? Number { get; private set; }
    public string? Complement { get; private set; }
    public string? Neighborhood { get; private set; }
    public int CityCode { get; private set; } // Código IBGE do Município (ex: 4308608)
    public string? CityName { get; private set; }
    public string State { get; private set; } = "RS"; // UF (2 letras)
    public string? ZipCode { get; private set; }

    // Certificado Digital A1 (Serializado em Banco)
    public byte[]? CertificateBytes { get; private set; }
    public string? CertificatePassword { get; private set; }
    public DateTime? CertificateExpiration { get; private set; }

    // Configurações Fiscais (Zeus DFe)
    public int Environment { get; private set; } = 2; // 1 = Produção, 2 = Homologação
    public bool IsActive { get; private set; } = true;

    protected Company() { }

    public Company(string cnpj, string corporateName, string state)
    {
        Cnpj = cnpj;
        CorporateName = corporateName;
        State = state;
    }

    // Atualiza todos os dados obtidos da consulta da SEFAZ
    public void UpdateFiscalData(
        string corporateName,
        string? tradeName,
        string? stateRegistration,
        string? municipalRegistration,
        int crt,
        string? street,
        string? number,
        string? complement,
        string? neighborhood,
        int cityCode,
        string? cityName,
        string state,
        string? zipCode)
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

    // Associa o Certificado A1 serializado em bytes
    public void SetCertificate(byte[] bytes, string password, DateTime expiration)
    {
        CertificateBytes = bytes;
        CertificatePassword = password;
        // Garante que a data seja gravada em UTC no PostgreSQL
        CertificateExpiration = expiration.Kind == DateTimeKind.Utc ? expiration : expiration.ToUniversalTime();
    }

    public void UpdateEnvironment(int environment)
    {
        Environment = environment;
    }
}