namespace CoreWMS.Api.Infrastructure.Fiscal.NfeParser;

public record NfeParsedItem(
    int LineNumber,
    string SkuCode,            // cProd
    string? Barcode,           // cEAN (Tratado se for "SEM GTIN")
    string Description,        // xProd
    string Ncm,                // NCM
    string? Cest,              // CEST
    string Unit,               // uCom
    decimal Quantity,          // qCom
    decimal UnitValue,         // vUnCom
    string? Batch,             // rastro > nLote
    DateTime? ManufactureDate, // rastro > dFab
    DateTime? ExpirationDate   // rastro > dVal
);

public record NfeParsedIssuer(
    string Cnpj,               // emit > CNPJ ou CPF
    string CorporateName,      // emit > xNome
    string? TradeName,         // emit > xFant
    string? StateRegistration,    // emit > IE
    string? MunicipalRegistration,// emit > IM
    int? Crt,                  // emit > CRT
    string? Cnae,              // emit > CNAE
    string? Street,            // emit > enderEmit > xLgr
    string? Number,            // emit > enderEmit > nro
    string? Complement,        // emit > enderEmit > xCmpl
    string? Neighborhood,      // emit > enderEmit > xBairro
    int? CityCode,             // emit > enderEmit > cMun
    string? CityName,           // emit > enderEmit > xMun
    string State,              // emit > enderEmit > UF
    string? ZipCode,           // emit > enderEmit > CEP
    string? Phone              // emit > enderEmit > fone
);

public record NfeParsedRecipient(
    string CnpjCpf,            // dest > CNPJ ou CPF
    string Name,               // dest > xNome
    string? StateRegistration, // dest > IE
    int IeIndicator,           // dest > indIEDest (1=Contribuinte, 2=Isento, 9=Não Contribuinte)
    string? Street,            // dest > enderDest > xLgr
    string? Number,            // dest > enderDest > nro
    string? Complement,        // dest > enderDest > xCmpl
    string? Neighborhood,      // dest > enderDest > xBairro
    int CityCode,              // dest > enderDest > cMun
    string CityName,           // dest > enderDest > xMun
    string State,              // dest > enderDest > UF
    string? ZipCode            // dest > enderDest > CEP
);

public record NfeParsedData(
    string AccessKey,          // Id da <infNFe>
    DateTime IssueDate,        // dhEmi
    string IssuerCnpj,         // Shortcut para emit > CNPJ/CPF
    string IssuerName,         // Shortcut para emit > xNome
    NfeParsedIssuer Issuer,    // Dados completos do depositante
    NfeParsedRecipient Recipient, // Dados completos do destinatário
    int FreightModality,       // transp > modFrete (0=CIF, 1=FOB, etc)
    string? CarrierCnpjCpf,    // transp > transporta > CNPJ/CPF
    string? CarrierName,       // transp > transporta > xNome
    string? CarrierIe,         // transp > transporta > IE
    string? VehiclePlate,      // transp > veicTransp > placa
    string? VehiclePlateState, // transp > veicTransp > UF
    List<NfeParsedItem> Items
);