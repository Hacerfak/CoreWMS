namespace CoreWMS.Api.Features.Outbound.Enums;

public enum OutboundOrderStatus
{
    Pending = 1,       // Importado, aguarda motor de alocação de stock
    Allocating = 2,    // Motor em execução
    Allocated = 3,     // Stock reservado, pronto para o coletor
    Picking = 4,       // Operador a separar no armazém
    Packing = 5,       // Mesa de embalagem / montagem de volumes fracionados
    ReadyToShip = 6,   // Conferência 100% concluída, apto para emissão da NF-e
    Shipped = 7,       // NF-e emitida e carga expedida
    Canceled = 8,      // Pedido cancelado
    Checking = 9       // Em conferência física (paralela ou pós-picking)
}

public enum OutboundOrderItemStatus
{
    Pending = 1,
    Allocated = 2,
    Picking = 3,
    Picked = 4,
    Packed = 5,
    Checked = 6        // 100% conferido pelo operador
}