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
    string DestCnpj,        // dest > CNPJ
    string DestName,        // dest > xNome
    List<NfeParsedItem> Items
);