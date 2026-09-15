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

        // Pode vir dentro de nfeProc (Com protocolo) ou direto NFe (Sem protocolo)
        var infNfe = doc.Descendants(Ns + "infNFe").FirstOrDefault()
            ?? throw new ArgumentException("XML inválido. Tag <infNFe> não encontrada.");

        var accessKey = infNfe.Attribute("Id")?.Value.Replace("NFe", "")
            ?? throw new ArgumentException("Chave de acesso (Id) não encontrada na tag <infNFe>.");

        var ide = infNfe.Element(Ns + "ide") ?? throw new ArgumentException("Tag <ide> não encontrada.");
        var dhEmiStr = ide.Element(Ns + "dhEmi")?.Value;
        var issueDate = DateTime.TryParse(dhEmiStr, out var d) ? d.ToUniversalTime() : DateTime.UtcNow;

        var emit = infNfe.Element(Ns + "emit") ?? throw new ArgumentException("Tag <emit> não encontrada.");
        var dest = infNfe.Element(Ns + "dest") ?? throw new ArgumentException("Tag <dest> não encontrada.");
        var enderDest = dest.Element(Ns + "enderDest");

        var items = new List<NfeParsedItem>();

        foreach (var det in infNfe.Elements(Ns + "det"))
        {
            var nItem = int.Parse(det.Attribute("nItem")?.Value ?? "0");
            var prod = det.Element(Ns + "prod");

            if (prod == null) continue;

            var ean = prod.Element(Ns + "cEAN")?.Value;
            if (ean == "SEM GTIN") ean = null;

            // Extração de Rastreabilidade (Medicamentos, Agrícolas, Bebidas)
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

            items.Add(new NfeParsedItem(
                nItem,
                prod.Element(Ns + "cProd")?.Value ?? "",
                ean,
                prod.Element(Ns + "xProd")?.Value ?? "",
                prod.Element(Ns + "NCM")?.Value ?? "",
                prod.Element(Ns + "CEST")?.Value,
                prod.Element(Ns + "uCom")?.Value ?? "",
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
            emit.Element(Ns + "CNPJ")?.Value ?? emit.Element(Ns + "CPF")?.Value ?? "",
            emit.Element(Ns + "xNome")?.Value ?? "",
            dest.Element(Ns + "CNPJ")?.Value ?? dest.Element(Ns + "CPF")?.Value ?? "",
            dest.Element(Ns + "xNome")?.Value ?? "",
            enderDest?.Element(Ns + "xMun")?.Value ?? "NÃO INFORMADO",
            enderDest?.Element(Ns + "UF")?.Value ?? "EX",
            enderDest?.Element(Ns + "CEP")?.Value,
            items
        );
    }

    private static decimal ParseDecimal(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return 0;
        // O XML da NF-e sempre usa Ponto '.' como separador decimal. Culture Invariant previne erros de localidade.
        return decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var result) ? result : 0;
    }
}