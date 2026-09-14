namespace CoreWMS.Api.Features.CycleCount.Enums;

public enum CycleCountPlanStatus
{
    Scheduled = 1,
    InProgress = 2,
    Review = 3,     // Aguardando aprovação do gestor para tarefas divergentes
    Closed = 4
}

public enum CycleCountTaskStatus
{
    Pending = 1,
    Counted_With_Divergence = 2,
    Escalated_To_Manager = 3,   // Rodada 1 e 2 falharam, aguarda liberação do desmanche
    Resolved = 4                // Contagem bateu ou ajuste (quarentena) foi realizado
}