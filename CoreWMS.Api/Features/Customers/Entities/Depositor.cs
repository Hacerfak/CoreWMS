using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;

namespace CoreWMS.Api.Features.Customers.Entities;

public class Customer : AuditableEntity
{
    // Vinculo obrigatório com a Empresa (Tenant)
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;

    public string Cnpj { get; private set; } = string.Empty;
    public string CorporateName { get; private set; } = string.Empty;
    public string? TradeName { get; private set; }
    public string? StateRegistration { get; private set; }
    public string? MunicipalRegistration { get; private set; }
    public int Crt { get; private set; } = 1; // 1=Simples Nacional, 3=Regime Normal

    // Endereço Fiscal
    public string? Street { get; private set; }
    public string? Number { get; private set; }
    public string? Complement { get; private set; }
    public string? Neighborhood { get; private set; }
    public int CityCode { get; private set; }
    public string? CityName { get; private set; }
    public string State { get; private set; } = string.Empty;
    public string? ZipCode { get; private set; }

    // Contatos Operacionais
    public string? Email { get; private set; }
    public string? Phone { get; private set; }

    // Regras Específicas do Depositante nesta Empresa
    public bool RequireBatchControl { get; private set; }
    public bool RequireExpirationControl { get; private set; }
    public bool RequireSerialControl { get; private set; }
    public bool AllowNegativeStock { get; private set; }
    public bool AutoApproveReceiving { get; private set; }
    public bool IsActive { get; private set; } = true;

    protected Customer() { }

    public Customer(
        Guid companyId,
        string cnpj,
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
        string? zipCode,
        string? email,
        string? phone,
        bool requireBatchControl,
        bool requireExpirationControl,
        bool requireSerialControl,
        bool allowNegativeStock,
        bool autoApproveReceiving)
    {
        CompanyId = companyId;
        Cnpj = cnpj;
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
        Email = email;
        Phone = phone;
        RequireBatchControl = requireBatchControl;
        RequireExpirationControl = requireExpirationControl;
        RequireSerialControl = requireSerialControl;
        AllowNegativeStock = allowNegativeStock;
        AutoApproveReceiving = autoApproveReceiving;
        IsActive = true;
    }

    public void Update(
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
        string? zipCode,
        string? email,
        string? phone,
        bool requireBatchControl,
        bool requireExpirationControl,
        bool requireSerialControl,
        bool allowNegativeStock,
        bool autoApproveReceiving)
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
        Email = email;
        Phone = phone;
        RequireBatchControl = requireBatchControl;
        RequireExpirationControl = requireExpirationControl;
        RequireSerialControl = requireSerialControl;
        AllowNegativeStock = allowNegativeStock;
        AutoApproveReceiving = autoApproveReceiving;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}