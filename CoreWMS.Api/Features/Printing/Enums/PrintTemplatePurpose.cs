namespace CoreWMS.Api.Features.Printing.Enums;

public enum PrintTemplatePurpose
{
    General = 1,
    InboundHU = 2,    // Etiqueta de Pallet/Caixa gerada no Recebimento
    OutboundHU = 3,   // Etiqueta de Expedição
    Product = 4,      // Etiqueta colada direto no produto
    Location = 5      // Etiqueta de Posição de Estoque (Endereço)
}