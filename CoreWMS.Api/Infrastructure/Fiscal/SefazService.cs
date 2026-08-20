using System.Security.Cryptography.X509Certificates;
using System.Text.RegularExpressions;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using NFe.Classes.Informacoes.Identificacao.Tipos;
using NFe.Classes.Servicos.ConsultaCadastro;
using NFe.Servicos;
using NFe.Utils;

namespace CoreWMS.Api.Infrastructure.Fiscal;

public record SefazCompanyDataDto(
    string Cnpj,
    string CorporateName,
    string? TradeName,
    string? StateRegistration,
    int Crt,
    string? Street,
    string? Number,
    string? Complement,
    string? Neighborhood,
    int CityCode,
    string? CityName,
    string State,
    string? ZipCode,
    DateTime CertificateExpiration
);

public interface ISefazService
{
    SefazCompanyDataDto ConsultarCadastro(byte[] certBytes, string certPassword, string uf);
}

public class SefazService : ISefazService
{
    public SefazCompanyDataDto ConsultarCadastro(byte[] certBytes, string certPassword, string uf)
    {
        // 1. Carrega o Certificado A1 usando o Loader nativo do .NET 9/10
        X509Certificate2 certificado;
        try
        {
            certificado = X509CertificateLoader.LoadPkcs12(
                certBytes,
                certPassword,
                X509KeyStorageFlags.PersistKeySet | X509KeyStorageFlags.Exportable
            );
        }
        catch (Exception)
        {
            throw new InvalidOperationException("Senha incorreta ou certificado A1 (.pfx) inválido.");
        }

        using (certificado)
        {
            // 2. Extrai o CNPJ do Certificado Digital via Regex
            var match = Regex.Match(certificado.Subject, @"([0-9]{14})");
            if (!match.Success)
            {
                throw new InvalidOperationException("CNPJ (14 dígitos) não foi encontrado no Certificado Digital.");
            }
            var cnpjEmitente = match.Groups[1].Value;

            // 3. Valida a UF informada
            if (!Enum.TryParse<Estado>(uf.ToUpper(), out var estadoEnum))
            {
                throw new ArgumentException($"UF '{uf}' é inválida.");
            }

            // 4. Configuração local do Serviço NFe (Consulta de Cadastro é realizada em ambiente de Produção)
            var cfg = new ConfiguracaoServico
            {
                tpAmb = TipoAmbiente.Producao,
                tpEmis = TipoEmissao.teNormal,
                ProtocoloDeSeguranca = System.Net.SecurityProtocolType.Tls12,
                cUF = estadoEnum,
                VersaoLayout = VersaoServico.Versao400,
                ModeloDocumento = ModeloDocumento.NFe,
                VersaoNfeConsultaCadastro = VersaoServico.Versao400,
                DiretorioSchemas = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Schemas"),
                ValidarSchemas = false
            };

            // 5. Instancia os Serviços NFe injetando o Certificado diretamente no construtor
            using var servicoSefaz = new ServicosNFe(cfg, certificado);
            var retornoSefaz = servicoSefaz.NfeConsultaCadastro(uf.ToUpper(), ConsultaCadastroTipoDocumento.Cnpj, cnpjEmitente);

            if (retornoSefaz?.Retorno?.infCons?.infCad == null)
            {
                var motivo = retornoSefaz?.Retorno?.infCons?.xMotivo ?? "A SEFAZ não retornou os dados cadastrais para este CNPJ/UF.";
                throw new InvalidOperationException($"Erro SEFAZ ({uf}): {motivo}");
            }

            var cad = retornoSefaz.Retorno.infCons.infCad;

            // 6. Mapeamento dos dados SEFAZ / IBGE
            return new SefazCompanyDataDto(
                Cnpj: cnpjEmitente,
                CorporateName: cad.xNome ?? "",
                TradeName: cad.xFant,
                StateRegistration: cad.IE,
                Crt: int.TryParse(cad.xRegApur, out var crtVal) ? crtVal : 1,
                Street: cad.ender?.xLgr,
                Number: cad.ender?.nro,
                Complement: cad.ender?.xCpl,
                Neighborhood: cad.ender?.xBairro,
                CityCode: int.TryParse(cad.ender?.cMun, out var ibgeVal) ? ibgeVal : 0,
                CityName: cad.ender?.xMun,
                State: cad.UF ?? uf.ToUpper(),
                ZipCode: cad.ender?.CEP?.ToString(),
                CertificateExpiration: certificado.NotAfter
            );
        }
    }
}