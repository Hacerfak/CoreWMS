using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Utils;

namespace CoreWMS.Api.Infrastructure.Fiscal.Configuration;

public interface IZeusConfigurator
{
    X509Certificate2 LoadCertificate(byte[] certBytes, string certPassword);
    ConfiguracaoServico GetNfeConfiguracao(Estado estado, TipoAmbiente ambiente = TipoAmbiente.Producao);
}

public class ZeusConfigurator : IZeusConfigurator
{
    public ZeusConfigurator()
    {
        // Configuração de segurança TLS obrigatória para comunicação SOAP da SEFAZ no Linux
#pragma warning disable SYSLIB0014
        ServicePointManager.ServerCertificateValidationCallback = (sender, cert, chain, sslPolicyErrors) =>
        {
            if (sslPolicyErrors == SslPolicyErrors.None) return true;
            if (sender is HttpWebRequest req)
            {
                var host = req.RequestUri.Host.ToLower();
                if (host.Contains("sefaz") || host.Contains("svrs") || host.Contains("fazenda"))
                    return true;
            }
            return false;
        };
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;
#pragma warning restore SYSLIB0014
    }

    public X509Certificate2 LoadCertificate(byte[] certBytes, string certPassword)
    {
        try
        {
            return X509CertificateLoader.LoadPkcs12(
                certBytes,
                certPassword,
                X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.Exportable
            );
        }
        catch (Exception)
        {
            throw new InvalidOperationException("Senha incorreta ou certificado A1 (.pfx) inválido.");
        }
    }

    public ConfiguracaoServico GetNfeConfiguracao(Estado estado, TipoAmbiente ambiente = TipoAmbiente.Producao)
    {
        return new ConfiguracaoServico
        {
            tpAmb = ambiente,
            tpEmis = TipoEmissao.teNormal,
            ProtocoloDeSeguranca = SecurityProtocolType.Tls12,
            cUF = estado,
            VersaoLayout = VersaoServico.Versao400,
            ModeloDocumento = ModeloDocumento.NFe,
            VersaoNfeConsultaCadastro = VersaoServico.Versao400,
            DiretorioSchemas = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Schemas"),
            ValidarSchemas = false
        };
    }
}