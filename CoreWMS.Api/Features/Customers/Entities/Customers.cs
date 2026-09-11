using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Products.Enums;

namespace CoreWMS.Api.Features.Customers.Entities;

public class Customer : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;
    public string Cnpj { get; private set; } = string.Empty;
    public string CorporateName { get; private set; } = string.Empty;
    public string? TradeName { get; private set; }
    public string? StateRegistration { get; private set; }

    // NOVO: Indicação IE do Destinatário (1=Contribuinte, 2=Isento, 9=Não Contribuinte)
    public int IeIndicator { get; private set; }

    public string? MunicipalRegistration { get; private set; }
    public int Crt { get; private set; }
    public string? Cnae { get; private set; }
    public string? Street { get; private set; }
    public string? Number { get; private set; }
    public string? Complement { get; private set; }
    public string? Neighborhood { get; private set; }
    public int CityCode { get; private set; }
    public string? CityName { get; private set; }
    public string State { get; private set; } = string.Empty;
    public string? ZipCode { get; private set; }
    public string? Email { get; private set; }
    public string? Phone { get; private set; }

    // Regras Logísticas WMS (Valores Default para o Produto)
    public bool TracksBatch { get; private set; }
    public bool StrictBatch { get; private set; }
    public bool TracksManufacture { get; private set; }
    public bool StrictManufacture { get; private set; }
    public bool TracksExpiration { get; private set; }
    public bool StrictExpiration { get; private set; }
    public bool TracksSerial { get; private set; }
    public bool StrictSerial { get; private set; }

    public PickingStrategy DefaultPickingStrategy { get; private set; }
    public PickingBaseDate DefaultPickingBaseDate { get; private set; }

    // NOVOS: Limites de Capacidade (SLA)
    public int? MaxDailyInboundOrders { get; private set; }
    public int? MaxDailyOutboundOrders { get; private set; }
    public int? MinStockVolume { get; private set; }
    public int? MaxStockVolume { get; private set; }

    // NOVOS: Regras de Conferência e Faturamento
    public bool RequiresBlindInbound { get; private set; }
    public bool RequiresBlindOutbound { get; private set; }
    public bool ReturnInvoicePerReferencedInvoice { get; private set; }

    public bool IsActive { get; private set; } = true;

    protected Customer() { }

    public Customer(Guid companyId, string cnpj, string corporateName, string? tradeName, string? stateRegistration, int ieIndicator, string? municipalRegistration, int crt, string? cnae, string? street, string? number, string? complement, string? neighborhood, int cityCode, string? cityName, string state, string? zipCode, string? email, string? phone,
        bool tracksBatch, bool strictBatch, bool tracksManufacture, bool strictManufacture, bool tracksExpiration, bool strictExpiration, bool tracksSerial, bool strictSerial,
        PickingStrategy defaultPickingStrategy, PickingBaseDate defaultPickingBaseDate,
        int? maxDailyInboundOrders, int? maxDailyOutboundOrders, int? minStockVolume, int? maxStockVolume,
        bool requiresBlindInbound, bool requiresBlindOutbound, bool returnInvoicePerReferencedInvoice)
    {
        CompanyId = companyId; Cnpj = cnpj; CorporateName = corporateName; TradeName = tradeName; StateRegistration = stateRegistration; IeIndicator = ieIndicator; MunicipalRegistration = municipalRegistration; Crt = crt; Cnae = cnae; Street = street; Number = number; Complement = complement; Neighborhood = neighborhood; CityCode = cityCode; CityName = cityName; State = state; ZipCode = zipCode; Email = email; Phone = phone;
        TracksBatch = tracksBatch; StrictBatch = strictBatch; TracksManufacture = tracksManufacture; StrictManufacture = strictManufacture; TracksExpiration = tracksExpiration; StrictExpiration = strictExpiration; TracksSerial = tracksSerial; StrictSerial = strictSerial;
        DefaultPickingStrategy = defaultPickingStrategy; DefaultPickingBaseDate = defaultPickingBaseDate;
        MaxDailyInboundOrders = maxDailyInboundOrders; MaxDailyOutboundOrders = maxDailyOutboundOrders; MinStockVolume = minStockVolume; MaxStockVolume = maxStockVolume;
        RequiresBlindInbound = requiresBlindInbound; RequiresBlindOutbound = requiresBlindOutbound; ReturnInvoicePerReferencedInvoice = returnInvoicePerReferencedInvoice;
    }

    public void Update(string corporateName, string? tradeName, string? stateRegistration, int ieIndicator, string? municipalRegistration, int crt, string? cnae, string? street, string? number, string? complement, string? neighborhood, int cityCode, string? cityName, string state, string? zipCode, string? email, string? phone,
        bool tracksBatch, bool strictBatch, bool tracksManufacture, bool strictManufacture, bool tracksExpiration, bool strictExpiration, bool tracksSerial, bool strictSerial,
        PickingStrategy defaultPickingStrategy, PickingBaseDate defaultPickingBaseDate,
        int? maxDailyInboundOrders, int? maxDailyOutboundOrders, int? minStockVolume, int? maxStockVolume,
        bool requiresBlindInbound, bool requiresBlindOutbound, bool returnInvoicePerReferencedInvoice)
    {
        CorporateName = corporateName; TradeName = tradeName; StateRegistration = stateRegistration; IeIndicator = ieIndicator; MunicipalRegistration = municipalRegistration; Crt = crt; Cnae = cnae; Street = street; Number = number; Complement = complement; Neighborhood = neighborhood; CityCode = cityCode; CityName = cityName; State = state; ZipCode = zipCode; Email = email; Phone = phone;
        TracksBatch = tracksBatch; StrictBatch = strictBatch; TracksManufacture = tracksManufacture; StrictManufacture = strictManufacture; TracksExpiration = tracksExpiration; StrictExpiration = strictExpiration; TracksSerial = tracksSerial; StrictSerial = strictSerial;
        DefaultPickingStrategy = defaultPickingStrategy; DefaultPickingBaseDate = defaultPickingBaseDate;
        MaxDailyInboundOrders = maxDailyInboundOrders; MaxDailyOutboundOrders = maxDailyOutboundOrders; MinStockVolume = minStockVolume; MaxStockVolume = maxStockVolume;
        RequiresBlindInbound = requiresBlindInbound; RequiresBlindOutbound = requiresBlindOutbound; ReturnInvoicePerReferencedInvoice = returnInvoicePerReferencedInvoice;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Deactivate() => IsActive = false;
    public void Activate() => IsActive = true;
}