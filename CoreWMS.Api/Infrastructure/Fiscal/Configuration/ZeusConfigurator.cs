using System;
using System.IO;
using System.Net;
using System.Security.Cryptography.X509Certificates;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using DFe.Utils;
using NFe.Utils;

namespace CoreWMS.Api.Infrastructure.Fiscal.Configuration;

public interface IZeusConfigurator
{
    X509Certificate2 LoadCertificate(byte[] certBytes, string certPassword);
    ConfiguracaoServico GetNfeConfiguracao(Estado estado, TipoAmbiente ambiente, byte[] certBytes, string certPassword);
    ConfiguracaoServico GetCompanyConfiguration(Company company);
}

public class ZeusConfigurator : IZeusConfigurator
{
    public ZeusConfigurator()
    {
#pragma warning disable SYSLIB0014
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13;
#pragma warning restore SYSLIB0014
    }

    public X509Certificate2 LoadCertificate(byte[] certBytes, string certPassword)
    {
        try
        {
            return CertificadoDigitalUtils.ObterDosBytes(
                certBytes,
                certPassword,
                X509KeyStorageFlags.MachineKeySet | X509KeyStorageFlags.Exportable
            );
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException($"Senha incorreta ou certificado A1 (.pfx) inválido: {ex.Message}");
        }
    }

    public ConfiguracaoServico GetNfeConfiguracao(Estado estado, TipoAmbiente ambiente, byte[] certBytes, string certPassword)
    {
        return new ConfiguracaoServico
        {
            ValidarCertificadoDoServidor = false,
            DiretorioSalvarXml = "",
            SalvarXmlServicos = false,
            ValidarSchemas = false,
            ProtocoloDeSeguranca = SecurityProtocolType.Tls12 | SecurityProtocolType.Tls13,
            RemoverAcentos = true,
            DefineVersaoServicosAutomaticamente = true,
            VersaoLayout = VersaoServico.Versao400,
            ModeloDocumento = ModeloDocumento.NFe,
            tpEmis = NFe.Classes.Informacoes.Identificacao.Tipos.TipoEmissao.teNormal,
            tpAmb = ambiente,
            cUF = estado,
            TimeOut = 30000,
            Certificado = new ConfiguracaoCertificado
            {
                TipoCertificado = TipoCertificado.A1ByteArray,
                ArrayBytesArquivo = certBytes,
                Senha = certPassword,
                ManterDadosEmCache = true
            }
        };
    }

    public ConfiguracaoServico GetCompanyConfiguration(Company company)
    {
        if (company.CertificateBytes == null || string.IsNullOrEmpty(company.CertificatePassword))
            throw new InvalidOperationException("Certificado Digital A1 não configurado para esta Empresa.");

        var estadoEnum = Enum.Parse<Estado>(company.State.ToUpper());
        var certPassword = CryptoService.Decrypt(company.CertificatePassword);

        return GetNfeConfiguracao(estadoEnum, TipoAmbiente.Homologacao, company.CertificateBytes, certPassword);
    }
}