namespace CoreWMS.Api.Features.Products.Enums;

public enum PickingBaseDate
{
    ReceiptDate = 1,     // Data de Recebimento no WMS (Físico)
    SystemEntryDate = 2, // Data de Integração/Criação no WMS (Sistema)
    InvoiceIssueDate = 3 // Data de Emissão da NF-e (Fiscal)
}