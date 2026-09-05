namespace CoreWMS.Api.Features.Topology.Enums;

public enum StorageRole
{
    Storage = 1,     // Armazenagem Padrão (Blocado, Porta-Pallet)
    Dock = 2,      // Doca de Recebimento/Expedição
    Quality = 3,     // Quarentena / Controle de Qualidade
    Picking = 4,     // Área de Separação
    Stage = 5        // Pulmão / Staging Area
}