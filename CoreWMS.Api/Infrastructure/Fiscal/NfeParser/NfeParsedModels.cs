namespace CoreWMS.Api.Infrastructure.Fiscal.NfeParser;

public record NfeParsedItem(
    int LineNumber,
    string SkuCode,         // cProd
    string? Barcode,        // cEAN (Tratado se for "SEM GTIN")
    string Description,     // xProd
    string Ncm,             // NCM
    string? Cest,           // CEST
    string Unit,            // uCom
    decimal Quantity,       // qCom
    decimal UnitValue,      // vUnCom
    string? Batch,          // rastro > nLote
    DateTime? ManufactureDate, // rastro > dFab
    DateTime? ExpirationDate   // rastro > dVal
);

public record NfeParsedData(
    string AccessKey,       // Id da <infNFe> ou <chNFe>
    DateTime IssueDate,     // dhEmi
    string IssuerCnpj,      // emit > CNPJ
    string IssuerName,      // emit > xNome
    string DestCnpj,        // dest > CNPJ ou CPF
    string DestName,        // dest > xNome
    string DestCity,        // dest > enderDest > xMun
    string DestState,       // dest > enderDest > UF
    string? DestZipCode,    // dest > enderDest > CEP
    List<NfeParsedItem> Items
);