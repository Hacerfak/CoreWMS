namespace CoreWMS.Api.Features.Inventory.Enums;

public enum TransactionType
{
    // ==========================================
    // 1. ENTRADAS E ACRÉSCIMOS
    // ==========================================

    /// Recebimento físico de mercadoria via NF-e na doca.
    Inbound_Receipt = 1,

    /// Ajuste positivo de inventário (sobra de contagem / fiscal).
    Inventory_Adjustment_In = 2,

    /// Estorno de expedição (cancelamento de saída devolvendo as HUs ao estoque).
    Outbound_Shipment_Revert = 12,

    // ==========================================
    // 2. MOVIMENTAÇÕES INTERNAS E ESTRUTURAIS
    // ==========================================

    /// Movimentação física entre endereços (Putaway e transferências).
    Internal_Move = 3,

    /// Bloqueio por motivo de qualidade/avaria (Quality Hold).
    Quality_Hold = 4,

    /// Liberação de qualidade para estoque disponível (Quality Release).
    Quality_Release = 5,

    /// Agrupamento / Consolidação de HUs idênticas (Merge).
    Hu_Merge = 10,

    /// Transbordo / Desmembramento de HU gerando novas HUs (Split).
    Hu_Split = 11,

    // ==========================================
    // 3. SAÍDAS E DEDUÇÕES
    // ==========================================

    /// Expedição de volume fechado (HU integral consumida sem fracionamento). 
    Outbound_Closed = 6,

    /// Expedição fracionada (peças separadas via picking de uma HU mãe). 
    Outbound_Fractional = 8,

    /// Ajuste negativo de inventário (falta de contagem / fiscal).
    Inventory_Adjustment_Out = 9,

    /// Estorno de recebimento de NF-e antes da expedição.
    Inbound_Receipt_Rollback = 13
}