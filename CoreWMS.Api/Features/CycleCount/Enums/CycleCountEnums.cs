namespace CoreWMS.Api.Features.CycleCount.Enums;

public enum CycleCountPlanStatus
{
    Draft = 1,                 // Rascunho cadastrado pela Gestão
    ApprovedForCounting = 2,   // Aprovado e liberado para os coletores
    InCounting = 3,            // Em execução no chão de fábrica
    InReview = 4,              // Contagem finalizada, sob análise da Gestão
    Closed = 5                 // Ajustes fiscais aplicados e plano encerrado
}

public enum CycleCountTaskStatus
{
    Pending = 1,                  // Aguardando operador contar
    CountedWithDivergence = 2,    // Contado com divergência entre físico e sistêmico
    AwaitingFiscalAdjustment = 3, // Aguardando NF de Remessa (Sobra) ou Retorno Simbólico (Falta)
    Resolved = 4                  // Finalizado e ajustado
}

public enum AdjustmentType
{
    None = 0,
    Surplus_InboundNfe = 1,       // Sobra: Exige NF-e de Remessa
    Shortage_ReturnNfe = 2        // Falta: Exige NF-e de Retorno Simbólico
}