namespace CoreWMS.Api.Features.Topology.Enums;

public enum StorageRole
{
    Storage = 1, // Armazenamento (Porta-Pallet, Blocado, Picking)
    Dock = 2,    // Doca (Recebimento / Expedição)
    Quality = 3, // Qualidade (Quarentena / Avarias Físicas)
    Virtual = 4  // Virtual (Faltas Fiscais, Em Trânsito, Perdas)
}