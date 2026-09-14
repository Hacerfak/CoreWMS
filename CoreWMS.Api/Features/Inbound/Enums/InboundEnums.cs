namespace CoreWMS.Api.Features.Inbound.Enums;

public enum InboundOrderStatus
{
    Pending = 1,       // Importada, aguardando início da conferência
    Receiving = 2,     // Conferência em andamento (itens sendo recebidos)
    Completed = 3,     // Recebimento 100% concluído e HUs geradas
    Canceled = 4       // Nota cancelada antes do recebimento
}

public enum InboundOrderItemStatus
{
    Pending_Review = 1, // Produto não existe no banco, aguardando pré-cadastro/vínculo
    Ready_To_Receive = 2, // Produto vinculado, pronto para o operador bipar
    Receiving = 3,        // Operador com o carrinho aberto (Item "Lockado")
    Completed = 4         // Quantidade 100% recebida (ou forçada a encerrar com falta)
}