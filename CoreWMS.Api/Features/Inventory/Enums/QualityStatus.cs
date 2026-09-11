namespace CoreWMS.Api.Features.Inventory.Enums;

public enum QualityStatus
{
    Available = 1,  // Livre para uso e expedição
    Quarantine = 2, // Bloqueio lógico pela Qualidade
    Damaged = 3     // Avaria física reportada
}