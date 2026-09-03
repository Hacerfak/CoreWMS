namespace CoreWMS.Api.Features.Topology.Enums;

public enum StorageCapacityStrategy
{
    Unitary = 1,        // Porta-pallet padrão (Capacidade = 1 HU por vão)
    DynamicStacking = 2 // Blocado (Capacidade = Footprint x Empilhamento Máximo do Produto)
}