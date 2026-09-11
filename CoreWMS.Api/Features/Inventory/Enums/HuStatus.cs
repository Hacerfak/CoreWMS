namespace CoreWMS.Api.Features.Inventory.Enums;

public enum HuStatus
{
    Expected = 1,  // ASN/XML importado, mas carga física não chegou
    Received = 2,  // Descarregado na Doca (Recebimento cego)
    Stored = 3,    // Armazenado no endereço físico
    Picking = 4,   // Em trânsito no carrinho de separação
    Staged = 5,    // Aguardando embarque na doca de saída
    Shipped = 6,   // Expedido (Fora do armazém)
    Consumed = 7   // Saldo zerado (Palete vazio/descartado)
}