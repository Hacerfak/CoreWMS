using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Outbound.Entities;
using CoreWMS.Api.Features.Topology.Entities;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IZplTemplateEngine
{
    string RenderHuTemplate(string rawZpl, HandlingUnit hu, string documentNumber);
    string RenderOutboundVolumeTemplate(string rawZpl, OutboundOrder order, OutboundVolume volume);
    string RenderLocationTemplate(string rawZpl, Location location);
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

    public string RenderOutboundVolumeTemplate(string rawZpl, OutboundOrder order, OutboundVolume volume)
    {
        if (string.IsNullOrWhiteSpace(rawZpl)) return string.Empty;

        var customerName = order.Customer?.CorporateName ?? order.Customer?.TradeName ?? "N/A";
        var destinationName = string.IsNullOrWhiteSpace(order.DestinationName) ? customerName : order.DestinationName;
        var destinationCityUf = string.Join(" / ", new[] { order.DestinationCity, order.DestinationState }
            .Where(s => !string.IsNullOrWhiteSpace(s)));
        var carrierName = string.IsNullOrWhiteSpace(order.CarrierName) ? "N/A" : order.CarrierName;
        var nfeNumber = string.IsNullOrWhiteSpace(order.InvoiceNumber) ? "N/A" : order.InvoiceNumber;
        var packagingCode = volume.PackagingType?.Code ?? "VOL";
        var shipDate = DateTime.UtcNow.ToString("dd/MM/yyyy");

        return rawZpl
            .Replace("<lpn_volume>", volume.VolumeLpn)
            .Replace("<num_pedido>", order.OrderNumber)
            .Replace("<nfe_saida>", nfeNumber)
            .Replace("<depositante>", customerName)
            .Replace("<destinatario>", destinationName)
            .Replace("<destino_cidade_uf>", string.IsNullOrWhiteSpace(destinationCityUf) ? "N/A" : destinationCityUf)
            .Replace("<transportadora>", carrierName)
            .Replace("<tipo_volume>", packagingCode)
            .Replace("<peso_bruto>", volume.GrossWeight.ToString("G29"))
            .Replace("<data_expedicao>", shipDate);
    }

    public string RenderLocationTemplate(string rawZpl, Location location)
    {
        if (string.IsNullOrWhiteSpace(rawZpl)) return string.Empty;

        var warehouseName = location.Zone?.Warehouse?.Name ?? "N/A";
        var zoneName = location.Zone?.Name ?? "N/A";
        var storageTypeName = location.StorageType?.Name ?? "N/A";

        return rawZpl
            .Replace("<codigo_endereco>", location.Code)
            .Replace("<caminho_endereco>", location.FullPath)
            .Replace("<armazem>", warehouseName)
            .Replace("<zona>", zoneName)
            .Replace("<tipo_armazenagem>", storageTypeName)
            .Replace("<capacidade_base>", location.BaseCapacity.ToString());
    }
}