namespace CoreWMS.Api.Features.Products.Enums;

public enum PickingStrategy
{
    Fifo = 1, // First-In, First-Out (Primeiro que entra, primeiro que sai)
    Fefo = 2, // First-Expire, First-Out (Primeiro a vencer, primeiro a sair - LEFO)
    Lifo = 3  // Last-In, First-Out (Último que entra, primeiro que sai - Usado no Blocado)
}