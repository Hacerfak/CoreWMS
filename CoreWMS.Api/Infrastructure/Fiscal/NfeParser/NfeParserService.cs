using System.Globalization;
using System.Xml.Linq;

namespace CoreWMS.Api.Infrastructure.Fiscal.NfeParser;

public interface INfeParserService
{
    NfeParsedData ParseXml(string xmlContent);
}

public class NfeParserService : INfeParserService
{
    private static readonly XNamespace Ns = "http://www.portalfiscal.inf.br/nfe";

    public NfeParsedData ParseXml(string xmlContent)
    {
        var doc = XDocument.Parse(xmlContent);

        var infNfe = doc.Descendants(Ns + "infNFe").FirstOrDefault()
            ?? throw new ArgumentException("XML inválido. Tag <infNFe> não encontrada.");

        var accessKey = infNfe.Attribute("Id")?.Value.Replace("NFe", "")
            ?? throw new ArgumentException("Chave de acesso (Id) não encontrada na tag <infNFe>.");

        var ide = infNfe.Element(Ns + "ide") ?? throw new ArgumentException("Tag <ide> não encontrada.");
        var dhEmiStr = ide.Element(Ns + "dhEmi")?.Value;
        var issueDate = DateTime.TryParse(dhEmiStr, out var d) ? d.ToUniversalTime() : DateTime.UtcNow;

        var emit = infNfe.Element(Ns + "emit") ?? throw new ArgumentException("Tag <emit> não encontrada.");
        var dest = infNfe.Element(Ns + "dest") ?? throw new ArgumentException("Tag <dest> não encontrada.");

        var enderEmit = emit.Element(Ns + "enderEmit");
        var enderDest = dest.Element(Ns + "enderDest");

        // Parse Emitente
        var issuerCnpj = emit.Element(Ns + "CNPJ")?.Value ?? emit.Element(Ns + "CPF")?.Value ?? "";
        var issuerName = emit.Element(Ns + "xNome")?.Value ?? "";
        int? crt = int.TryParse(emit.Element(Ns + "CRT")?.Value, out var cVal) ? cVal : null;
        int? cityCode = int.TryParse(enderEmit?.Element(Ns + "cMun")?.Value, out var codeVal) ? codeVal : null;

        var issuer = new NfeParsedIssuer(
            issuerCnpj,
            issuerName,
            emit.Element(Ns + "xFant")?.Value,
            emit.Element(Ns + "IE")?.Value,
            emit.Element(Ns + "IM")?.Value,
            crt,
            emit.Element(Ns + "CNAE")?.Value,
            enderEmit?.Element(Ns + "xLgr")?.Value,
            enderEmit?.Element(Ns + "nro")?.Value,
            enderEmit?.Element(Ns + "xCmpl")?.Value,
            enderEmit?.Element(Ns + "xBairro")?.Value,
            cityCode,
            enderEmit?.Element(Ns + "xMun")?.Value,
            enderEmit?.Element(Ns + "UF")?.Value ?? "EX",
            enderEmit?.Element(Ns + "CEP")?.Value,
            enderEmit?.Element(Ns + "fone")?.Value
        );

        // Parse Destinatário
        var destCnpjCpf = dest.Element(Ns + "CNPJ")?.Value ?? dest.Element(Ns + "CPF")?.Value ?? "";
        var destName = dest.Element(Ns + "xNome")?.Value ?? "";
        var destIe = dest.Element(Ns + "IE")?.Value;
        int destIeIndicator = int.TryParse(dest.Element(Ns + "indIEDest")?.Value, out var indVal) ? indVal : 9;
        int destCityCode = int.TryParse(enderDest?.Element(Ns + "cMun")?.Value, out var dCodeVal) ? dCodeVal : 0;

        var recipient = new NfeParsedRecipient(
            destCnpjCpf,
            destName,
            destIe,
            destIeIndicator,
            enderDest?.Element(Ns + "xLgr")?.Value,
            enderDest?.Element(Ns + "nro")?.Value,
            enderDest?.Element(Ns + "xCmpl")?.Value,
            enderDest?.Element(Ns + "xBairro")?.Value,
            destCityCode,
            enderDest?.Element(Ns + "xMun")?.Value ?? "NÃO INFORMADO",
            enderDest?.Element(Ns + "UF")?.Value ?? "EX",
            enderDest?.Element(Ns + "CEP")?.Value
        );

        // Parse Transporte & Veículo
        var transp = infNfe.Element(Ns + "transp");
        int freightModality = int.TryParse(transp?.Element(Ns + "modFrete")?.Value, out var modVal) ? modVal : 9;

        string? carrierCnpjCpf = null;
        string? carrierName = null;
        string? carrierIe = null;
        var transporta = transp?.Element(Ns + "transporta");
        if (transporta != null)
        {
            carrierCnpjCpf = transporta.Element(Ns + "CNPJ")?.Value ?? transporta.Element(Ns + "CPF")?.Value;
            carrierName = transporta.Element(Ns + "xNome")?.Value;
            carrierIe = transporta.Element(Ns + "IE")?.Value;
        }

        string? vehiclePlate = null;
        string? vehiclePlateState = null;
        var veicTransp = transp?.Element(Ns + "veicTransp");
        if (veicTransp != null)
        {
            vehiclePlate = veicTransp.Element(Ns + "placa")?.Value;
            vehiclePlateState = veicTransp.Element(Ns + "UF")?.Value;
        }

        // Parse Itens
        var items = new List<NfeParsedItem>();
        foreach (var det in infNfe.Elements(Ns + "det"))
        {
            var nItem = int.Parse(det.Attribute("nItem")?.Value ?? "0");
            var prod = det.Element(Ns + "prod");
            if (prod == null) continue;

            var ean = prod.Element(Ns + "cEAN")?.Value;
            if (ean == "SEM GTIN") ean = null;

            string? batch = null;
            DateTime? mfgDate = null;
            DateTime? expDate = null;

            var rastro = prod.Element(Ns + "rastro");
            if (rastro != null)
            {
                batch = rastro.Element(Ns + "nLote")?.Value;
                if (DateTime.TryParse(rastro.Element(Ns + "dFab")?.Value, out var mfg))
                    mfgDate = mfg.ToUniversalTime();
                if (DateTime.TryParse(rastro.Element(Ns + "dVal")?.Value, out var exp))
                    expDate = exp.ToUniversalTime();
            }

            var quantity = ParseDecimal(prod.Element(Ns + "qCom")?.Value);
            var unitValue = ParseDecimal(prod.Element(Ns + "vUnCom")?.Value);
            var unit = prod.Element(Ns + "uCom")?.Value ?? prod.Element(Ns + "uTrib")?.Value ?? "UN";

            items.Add(new NfeParsedItem(
                nItem,
                prod.Element(Ns + "cProd")?.Value ?? "",
                ean,
                prod.Element(Ns + "xProd")?.Value ?? "",
                prod.Element(Ns + "NCM")?.Value ?? "",
                prod.Element(Ns + "CEST")?.Value,
                unit,
                quantity,
                unitValue,
                batch,
                mfgDate,
                expDate
            ));
        }

        return new NfeParsedData(
            accessKey,
            issueDate,
            issuerCnpj,
            issuerName,
            issuer,
            recipient,
            freightModality,
            carrierCnpjCpf,
            carrierName,
            carrierIe,
            vehiclePlate,
            vehiclePlateState,
            items
        );
    }

    private static decimal ParseDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) ? result : 0;
    }
}