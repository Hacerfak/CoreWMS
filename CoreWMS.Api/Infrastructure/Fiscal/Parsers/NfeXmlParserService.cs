using System.Xml.Linq;

namespace CoreWMS.Api.Infrastructure.Fiscal.Parsers;

public record ParsedNfeItemDto(string cProd, string? cEAN, string xProd, string uCom, decimal qCom, decimal vUnCom, decimal vProd, string? NCM, string? CEST, string? nLote, DateTime? dFab, DateTime? dVal);
public record ParsedNfeDto(string AccessKey, string nNF, string serie, DateTime dhEmi, string EmitenteCnpj, string EmitenteNome, string DestinatarioCnpj, string DestinatarioNome, List<ParsedNfeItemDto> Items);

public interface INfeXmlParserService
{
    ParsedNfeDto Parse(string xmlContent);
}

public class NfeXmlParserService : INfeXmlParserService
{
    public ParsedNfeDto Parse(string xmlContent)
    {
        var doc = XDocument.Parse(xmlContent);
        XNamespace ns = doc.Root?.GetDefaultNamespace() ?? string.Empty;

        var infNFe = doc.Descendants(ns + "infNFe").FirstOrDefault()
            ?? throw new InvalidOperationException("O arquivo enviado não é um XML de NF-e válido.");

        var accessKey = infNFe.Attribute("Id")?.Value.Replace("NFe", "") ?? string.Empty;

        var ide = infNFe.Element(ns + "ide");
        var nNF = ide?.Element(ns + "nNF")?.Value ?? string.Empty;
        var serie = ide?.Element(ns + "serie")?.Value ?? string.Empty;
        var dhEmi = DateTime.Parse(ide?.Element(ns + "dhEmi")?.Value ?? DateTime.UtcNow.ToString());

        var emit = infNFe.Element(ns + "emit");
        var emitCnpj = emit?.Element(ns + "CNPJ")?.Value ?? string.Empty;
        var emitNome = emit?.Element(ns + "xNome")?.Value ?? string.Empty;

        var dest = infNFe.Element(ns + "dest");
        var destCnpj = dest?.Element(ns + "CNPJ")?.Value ?? string.Empty;
        var destNome = dest?.Element(ns + "xNome")?.Value ?? string.Empty;

        var items = new List<ParsedNfeItemDto>();

        foreach (var det in infNFe.Elements(ns + "det"))
        {
            var prod = det.Element(ns + "prod");
            if (prod == null) continue;

            // Tratamento de tags ausentes e EANs inválidos ("SEM GTIN")
            var cEAN = prod.Element(ns + "cEAN")?.Value;
            if (cEAN == "SEM GTIN") cEAN = null;

            // Busca por Rastreabilidade (Medicamentos ou Lotes Genéricos)
            var rastro = prod.Element(ns + "rastro") ?? prod.Element(ns + "med");
            string? nLote = rastro?.Element(ns + "nLote")?.Value;

            DateTime? dFab = null;
            if (DateTime.TryParse(rastro?.Element(ns + "dFab")?.Value, out var parsedFab)) dFab = parsedFab;

            DateTime? dVal = null;
            if (DateTime.TryParse(rastro?.Element(ns + "dVal")?.Value, out var parsedVal)) dVal = parsedVal;

            items.Add(new ParsedNfeItemDto(
                cProd: prod.Element(ns + "cProd")?.Value ?? string.Empty,
                cEAN: cEAN,
                xProd: prod.Element(ns + "xProd")?.Value ?? string.Empty,
                uCom: prod.Element(ns + "uCom")?.Value ?? string.Empty,
                qCom: decimal.Parse(prod.Element(ns + "qCom")?.Value ?? "0", System.Globalization.CultureInfo.InvariantCulture),
                vUnCom: decimal.Parse(prod.Element(ns + "vUnCom")?.Value ?? "0", System.Globalization.CultureInfo.InvariantCulture),
                vProd: decimal.Parse(prod.Element(ns + "vProd")?.Value ?? "0", System.Globalization.CultureInfo.InvariantCulture),
                NCM: prod.Element(ns + "NCM")?.Value,
                CEST: prod.Element(ns + "CEST")?.Value,
                nLote: nLote,
                dFab: dFab,
                dVal: dVal
            ));
        }

        return new ParsedNfeDto(accessKey, nNF, serie, dhEmi, emitCnpj, emitNome, destCnpj, destNome, items);
    }
}