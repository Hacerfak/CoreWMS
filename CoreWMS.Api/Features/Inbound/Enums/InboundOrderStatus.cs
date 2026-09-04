namespace CoreWMS.Api.Features.Inbound.Enums;

public enum InboundOrderStatus
{
    PendingReview = 1, // Falta vincular/cadastrar produtos do XML com o Catálogo
    AwaitingDock = 2,  // XML revisado, aguardando atribuição de Doca e início
    InConference = 3,  // Em contagem física (Operador bipando as HUs)
    Finished = 4,      // Finalizado (Estoque atualizado e liberado)
    Canceled = 5       // Estornado / Cancelado
}