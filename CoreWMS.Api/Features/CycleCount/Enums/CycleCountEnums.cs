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
    Pending = 1,               // Aguardando operador iniciar
    InCounting = 2,            // Operador abriu o modal e está contando
    CountedWithDivergence = 3, // Rodadas finalizadas com divergência física
    AwaitingFiscalAdjustment = 4,// Aguardando vínculo/emissão de NF-e
    Resolved = 5,              // Conciliado sem divergência ou com ajuste fiscal efetuado
    Recounted = 6              // Recontada (Histórico mantido; gerada nova tarefa)
}

public enum AdjustmentType
{
    None = 0,
    Surplus_InboundNfe = 1,       // Sobra: Exige NF-e de Remessa
    Shortage_ReturnNfe = 2        // Falta: Exige NF-e de Retorno Simbólico
}