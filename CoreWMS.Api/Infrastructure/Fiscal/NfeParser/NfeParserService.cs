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

        // Extração do número e da série da NF
        string? invoiceNumber = ide.Element(Ns + "nNF")?.Value;
        string? invoiceSerie = ide.Element(Ns + "serie")?.Value;

        if (string.IsNullOrWhiteSpace(invoiceNumber) && accessKey.Length == 44 && long.TryParse(accessKey.Substring(25, 9), out var nNfVal))
        {
            invoiceNumber = nNfVal.ToString();
        }

        if (string.IsNullOrWhiteSpace(invoiceSerie) && accessKey.Length == 44 && int.TryParse(accessKey.Substring(22, 3), out var serieVal))
        {
            invoiceSerie = serieVal.ToString();
        }

        var emit = infNfe.Element(Ns + "emit") ?? throw new ArgumentException("Tag <emit> não encontrada.");
        var dest = infNfe.Element(Ns + "dest") ?? throw new ArgumentException("Tag <dest> não encontrada.");

        var enderEmit = emit.Element(Ns + "enderEmit");
        var enderDest = dest.Element(Ns + "enderDest");

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

        var transp = infNfe.Element(Ns + "transp");
        int freightModality = int.TryParse(transp?.Element(Ns + "modFrete")?.Value, out var modVal) ? modVal : 9;
        string? carrierCnpjCpf = null;
        string? carrierName = null;
        string? carrierIe = null;
        string? carrierAddress = null;
        string? carrierCity = null;
        string? carrierState = null;

        var transporta = transp?.Element(Ns + "transporta");
        if (transporta != null)
        {
            carrierCnpjCpf = transporta.Element(Ns + "CNPJ")?.Value ?? transporta.Element(Ns + "CPF")?.Value;
            carrierName = transporta.Element(Ns + "xNome")?.Value;
            carrierIe = transporta.Element(Ns + "IE")?.Value;
            carrierAddress = transporta.Element(Ns + "xEnder")?.Value;
            carrierCity = transporta.Element(Ns + "xMun")?.Value;
            carrierState = transporta.Element(Ns + "UF")?.Value;
        }

        string? vehiclePlate = null;
        string? vehiclePlateState = null;
        var veicTransp = transp?.Element(Ns + "veicTransp");
        if (veicTransp != null)
        {
            vehiclePlate = veicTransp.Element(Ns + "placa")?.Value;
            vehiclePlateState = veicTransp.Element(Ns + "UF")?.Value;
        }

        decimal totalNetWeight = 0m;
        decimal totalGrossWeight = 0m;
        int totalVolumes = 0;
        string? volumeSpecies = null;

        if (transp != null)
        {
            foreach (var vol in transp.Elements(Ns + "vol"))
            {
                totalNetWeight += ParseDecimal(vol.Element(Ns + "pesoL")?.Value);
                totalGrossWeight += ParseDecimal(vol.Element(Ns + "pesoB")?.Value);
                if (int.TryParse(vol.Element(Ns + "qVol")?.Value, out var qv))
                    totalVolumes += qv;
                if (string.IsNullOrWhiteSpace(volumeSpecies))
                    volumeSpecies = vol.Element(Ns + "esp")?.Value;
            }
        }

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
                batch = rastro.Element(Ns + "nLote")?.Value?.Trim();

                // Converte AAAA-MM-DD diretamente para UTC sem distorção de fuso
                if (DateTime.TryParse(rastro.Element(Ns + "dFab")?.Value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var mfg))
                    mfgDate = DateTime.SpecifyKind(mfg.Date, DateTimeKind.Utc);

                if (DateTime.TryParse(rastro.Element(Ns + "dVal")?.Value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var exp))
                    expDate = DateTime.SpecifyKind(exp.Date, DateTimeKind.Utc);
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
            carrierAddress,
            carrierCity,
            carrierState,
            vehiclePlate,
            vehiclePlateState,
            items,
            totalNetWeight > 0 ? totalNetWeight : null,
            totalGrossWeight > 0 ? totalGrossWeight : null,
            totalVolumes > 0 ? totalVolumes : null,
            volumeSpecies,
            invoiceNumber,
            invoiceSerie
        );
    }

    private static decimal ParseDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        return decimal.TryParse(value.Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var result) ? result : 0;
    }
}