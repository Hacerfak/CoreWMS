using System.Text;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using DFe.Utils;
using NFe.Classes.Servicos.Tipos;
using NFe.Servicos;

namespace CoreWMS.Api.Infrastructure.Fiscal.Queries;

public record DocumentoZipDto(string Nsu, string Schema, string XmlDescompactado);

public record SefazDistribuicaoResultDto(
    bool Sucesso,
    string UltimoNsuRetornado,
    string Mensagem,
    List<DocumentoZipDto> Documentos,
    SefazManifestacaoResultDto? CienciaEfetuada = null
);

public record SefazManifestacaoResultDto(
    bool Sucesso,
    string Mensagem,
    string? Protocolo = null,
    DateTime? DataEvento = null
);

public interface ISefazDistDFeService
{
    Task<SefazDistribuicaoResultDto> BaixarDocumentoPorChaveAsync(Company company, string chaveAcesso, TipoAmbiente ambiente = TipoAmbiente.Producao, CancellationToken ct = default);
    Task<SefazManifestacaoResultDto> EnviarManifestacaoAsync(Company company, string chaveAcesso, int codigoEvento, string justificativa = "", TipoAmbiente ambiente = TipoAmbiente.Producao, CancellationToken ct = default);
}

public class SefazDistDFeService : ISefazDistDFeService
{
    private readonly IZeusConfigurator _zeusConfigurator;

    public SefazDistDFeService(IZeusConfigurator zeusConfigurator)
    {
        _zeusConfigurator = zeusConfigurator;
    }

    public async Task<SefazDistribuicaoResultDto> BaixarDocumentoPorChaveAsync(Company company, string chaveAcesso, TipoAmbiente ambiente = TipoAmbiente.Producao, CancellationToken ct = default)
    {
        return await Task.Run(async () =>
        {
            var documentosLidos = new List<DocumentoZipDto>();
            string chaveValida = chaveAcesso?.Trim() ?? string.Empty;
            SefazManifestacaoResultDto? cienciaResult = null;

            if (chaveValida.Length != 44)
                return new SefazDistribuicaoResultDto(false, "0", "A Chave de Acesso deve conter exatamente 44 dígitos.", documentosLidos);

            try
            {
                var config = _zeusConfigurator.GetCompanyConfiguration(company, ambiente);
                using var servicoNfe = new ServicosNFe(config);
                string ufArg = ((int)config.cUF).ToString();

                var retorno = servicoNfe.NfeDistDFeInteresse(
                    ufAutor: ufArg,
                    documento: company.Cnpj,
                    ultNSU: "0",
                    nSU: "0",
                    chNFE: chaveValida
                );

                if (retorno?.Retorno == null)
                    return new SefazDistribuicaoResultDto(false, "0", "SEFAZ não respondeu à consulta por chave.", documentosLidos);

                var ret = retorno.Retorno;

                if (ret.cStat == 138 && ret.loteDistDFeInt != null)
                {
                    var procDoc = ret.loteDistDFeInt.FirstOrDefault(d => d.schema != null && d.schema.ToLower().Contains("procnfe"));

                    // Se a SEFAZ retornar apenas o resumo (resNFe), envia Ciência da Operação (210210)
                    if (procDoc == null)
                    {
                        cienciaResult = await EnviarManifestacaoAsync(company, chaveValida, 210210, "", ambiente, ct);
                        if (cienciaResult.Sucesso)
                        {
                            retorno = servicoNfe.NfeDistDFeInteresse(
                                ufAutor: ufArg,
                                documento: company.Cnpj,
                                ultNSU: "0",
                                nSU: "0",
                                chNFE: chaveValida
                            );
                            ret = retorno?.Retorno ?? ret;
                        }
                    }

                    if (ret.loteDistDFeInt != null)
                    {
                        foreach (var docZip in ret.loteDistDFeInt)
                        {
                            var xmlDescompactado = Compressao.Unzip(docZip.XmlNfe);
                            documentosLidos.Add(new DocumentoZipDto(docZip.NSU.ToString(), docZip.schema ?? "", xmlDescompactado));
                        }
                    }

                    if (documentosLidos.Any())
                        return new SefazDistribuicaoResultDto(true, ret.ultNSU.ToString(), "XML consultado e obtido com sucesso da SEFAZ!", documentosLidos, cienciaResult);
                }

                return new SefazDistribuicaoResultDto(false, ret.ultNSU.ToString(), $"SEFAZ [{ret.cStat}]: {ret.xMotivo}", documentosLidos);
            }
            catch (Exception ex)
            {
                return new SefazDistribuicaoResultDto(false, "0", $"Falha de comunicação SEFAZ: {ex.Message}", documentosLidos);
            }
        }, ct);
    }

    public async Task<SefazManifestacaoResultDto> EnviarManifestacaoAsync(
        Company company,
        string chaveAcesso,
        int codigoEvento,
        string justificativa = "",
        TipoAmbiente ambiente = TipoAmbiente.Producao,
        CancellationToken ct = default)
    {
        return await Task.Run(() =>
        {
            try
            {
                var config = _zeusConfigurator.GetCompanyConfiguration(company, ambiente);
                using var servicoNfe = new ServicosNFe(config);

                int idLote = Convert.ToInt32(DateTime.Now.ToString("HHmmss"));
                int seqEvento = 1;

                var tipoEvento = codigoEvento switch
                {
                    210210 => NFeTipoEvento.TeMdCienciaDaOperacao,
                    210200 => NFeTipoEvento.TeMdConfirmacaoDaOperacao,
                    210240 => NFeTipoEvento.TeMdOperacaoNaoRealizada,
                    210220 => NFeTipoEvento.TeMdDesconhecimentoDaOperacao,
                    _ => throw new ArgumentException("Código de manifestação inválido.")
                };

                string? just = null;
                if (codigoEvento == 210240)
                {
                    just = justificativa?.Trim();
                    if (string.IsNullOrEmpty(just) || just.Length < 15)
                        return new SefazManifestacaoResultDto(false, "A SEFAZ exige justificativa de no mínimo 15 caracteres para 'Operação Não Realizada'.");
                }

                var retorno = servicoNfe.RecepcaoEventoManifestacaoDestinatario(
                    idLote, seqEvento, chaveAcesso, tipoEvento, company.Cnpj, just, dhEvento: null);

                if (retorno?.Retorno == null)
                    return new SefazManifestacaoResultDto(false, "SEFAZ não respondeu ao evento de manifestação.");

                var retEnv = retorno.Retorno;

                if (retEnv.cStat != 128)
                    return new SefazManifestacaoResultDto(false, $"Rejeição Lote [{retEnv.cStat}]: {retEnv.xMotivo}");

                if (retEnv.retEvento != null && retEnv.retEvento.Count > 0)
                {
                    var retEv = retEnv.retEvento[0].infEvento;
                    if (retEv.cStat == 135 || retEv.cStat == 573) // 135 = Evento vinculado, 573 = Duplicidade
                    {
                        return new SefazManifestacaoResultDto(
                            true,
                            $"[{retEv.cStat}] {retEv.xMotivo}",
                            Protocolo: retEv.nProt,
                            DataEvento: retEv.dhRegEvento.Date
                        );
                    }

                    return new SefazManifestacaoResultDto(false, $"Rejeição SEFAZ [{retEv.cStat}]: {retEv.xMotivo}");
                }

                return new SefazManifestacaoResultDto(false, "SEFAZ retornou lote vazio para o evento.");
            }
            catch (Exception ex)
            {
                return new SefazManifestacaoResultDto(false, $"Erro na transmissão da manifestação: {ex.Message}");
            }
        }, ct);
    }
}