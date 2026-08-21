using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using NFe.Servicos;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;

namespace CoreWMS.Api.Infrastructure.Fiscal.Queries;

public record SefazStatusResultDto(bool Online, string Motivo, int TempoMedioRespostaSec);

public interface ISefazStatusServicoService
{
    SefazStatusResultDto ConsultarStatus(byte[] certBytes, string certPassword, string uf, TipoAmbiente ambiente);
}

public class SefazStatusServicoService : ISefazStatusServicoService
{
    private readonly IZeusConfigurator _zeusConfigurator;

    public SefazStatusServicoService(IZeusConfigurator zeusConfigurator)
    {
        _zeusConfigurator = zeusConfigurator;
    }

    public SefazStatusResultDto ConsultarStatus(byte[] certBytes, string certPassword, string uf, TipoAmbiente ambiente)
    {
        using var certificado = _zeusConfigurator.LoadCertificate(certBytes, certPassword);

        if (!Enum.TryParse<Estado>(uf.ToUpper(), out var estadoEnum))
            throw new ArgumentException($"UF '{uf}' é inválida.");

        var cfg = _zeusConfigurator.GetNfeConfiguracao(estadoEnum, ambiente);

        using var servicoSefaz = new ServicosNFe(cfg, certificado);
        var retorno = servicoSefaz.NfeStatusServico();

        var isOnline = retorno?.Retorno != null && retorno.Retorno.cStat == 107; // 107 = Serviço em Operação

        return new SefazStatusResultDto(
            Online: isOnline,
            Motivo: retorno?.Retorno?.xMotivo ?? "Sem resposta da SEFAZ",
            TempoMedioRespostaSec: retorno?.Retorno?.tMed ?? 0
        );
    }
}