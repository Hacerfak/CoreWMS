namespace CoreWMS.Api.Features.Inventory.Enums;

public enum TransactionType
{
    // Entradas
    Inbound_Receipt = 1,
    Inventory_Adjustment_In = 2,

    // Movimentações Internas (Sem custo faturável direto, mas rastreáveis)
    Internal_Move = 3,
    Quality_Hold = 4,
    Quality_Release = 5,

    // Saídas (Faturáveis por tipo de esforço)
    Outbound_FullPallet = 6,
    Outbound_FullBox = 7,
    Outbound_Fractional = 8,
    Inventory_Adjustment_Out = 9
}