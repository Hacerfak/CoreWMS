using System.Text.RegularExpressions;
using CoreWMS.Api.Features.Inventory.Entities;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IZplTemplateEngine
{
    string RenderHuTemplate(string rawZpl, HandlingUnit hu, string documentNumber);
}

public class ZplTemplateEngine : IZplTemplateEngine
{
    public string RenderHuTemplate(string rawZpl, HandlingUnit hu, string documentNumber)
    {
        if (string.IsNullOrWhiteSpace(rawZpl)) return string.Empty;

        var expDate = hu.ExpirationDate.HasValue
            ? hu.ExpirationDate.Value.ToString("dd/MM/yyyy")
            : "N/A";

        var receiptDate = hu.CreatedAt.ToString("dd/MM/yyyy");

        var customerName = hu.Customer?.CorporateName ?? hu.Customer?.TradeName ?? "N/A";
        var productDescription = hu.Product?.Description ?? "N/A";
        var productSku = hu.Product?.Sku ?? string.Empty;
        var unit = hu.Product?.BaseUnit ?? "UN";

        return rawZpl
            .Replace("<codigo>", productSku)
            .Replace("<lote>", string.IsNullOrWhiteSpace(hu.Batch) ? "N/A" : hu.Batch)
            .Replace("<num_hu>", hu.Lpn)
            .Replace("<validade>", expDate)
            .Replace("<nfe_entrada>", documentNumber)
            .Replace("<data_recebimento>", receiptDate)
            .Replace("<depositante>", customerName)
            .Replace("<nome_produto>", productDescription)
            .Replace("<quantidade_produto>", hu.CurrentQuantity.ToString("G29"))
            .Replace("<unidade_medida>", unit);
    }
}