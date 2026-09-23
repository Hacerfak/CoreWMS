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

public record NfeParsedData(
    string AccessKey,          // Id da <infNFe> ou <chNFe>
    DateTime IssueDate,        // dhEmi
    string IssuerCnpj,         // Shortcut para emit > CNPJ/CPF (compatibilidade)
    string IssuerName,         // Shortcut para emit > xNome (compatibilidade)
    NfeParsedIssuer Issuer,    // Objeto completo com dados do depositante e endereço
    string DestCnpj,           // dest > CNPJ ou CPF
    string DestName,           // dest > xNome
    string DestCity,           // dest > enderDest > xMun
    string DestState,          // dest > enderDest > UF
    string? DestZipCode,       // dest > enderDest > CEP
    List<NfeParsedItem> Items
);