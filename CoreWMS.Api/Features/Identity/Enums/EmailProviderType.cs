namespace CoreWMS.Api.Features.Identity.Enums;

public enum EmailProviderType
{
    Disabled = 0,          // Envio desativado para a empresa
    Smtp = 1,              // Servidor SMTP tradicional (Host, Porta, TLS/SSL)
    GoogleWorkspace = 2    // API do Gmail via Conta de Serviço do Google Workspace
}