namespace CoreWMS.Api.Features.Outbound.Enums;

public enum OutboundOrderStatus
{
    Pending = 1,       // Importado, aguardando motor de alocação de estoque
    Allocating = 2,    // Motor rodando (pode faltar estoque parcial)
    Allocated = 3,     // Estoque 100% reservado, pronto para ir pro Coletor
    Picking = 4,       // Operador está rodando o armazém separando
    Packing = 5,       // Operador está montando os paletes de envio/caixas e bipando os itens dentro
    ReadyToShip = 6,   // Checkout finalizado, aguardando emissão da NF-e de Retorno/Remessa
    Shipped = 7,       // NF-e Emitida, mercadoria entregue para transportadora
    Canceled = 8       // Pedido cancelado (estorna alocações)
}

public enum OutboundOrderItemStatus
{
    Pending = 1,
    Allocated = 2,     // Quantidade Alocada == Quantidade Solicitada
    Picking = 3,
    Picked = 4,        // Quantidade Separada == Quantidade Alocada
    Packed = 5         // Item já foi colocado em uma HU de Expedição (Shipping HU)
}