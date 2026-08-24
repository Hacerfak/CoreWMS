using System.Text.RegularExpressions;
using DFe.Classes.Entidades;
using NFe.Classes.Servicos.ConsultaCadastro;
using NFe.Servicos;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Models;

namespace CoreWMS.Api.Infrastructure.Fiscal.Queries;

public interface ISefazConsultaCadastroService
{
    SefazCompanyDataDto Consultar(byte[] certBytes, string certPassword, string uf, string? targetCnpj = null);
}

public class SefazConsultaCadastroService : ISefazConsultaCadastroService
{
    private readonly IZeusConfigurator _zeusConfigurator;

    public SefazConsultaCadastroService(IZeusConfigurator zeusConfigurator)
    {
        _zeusConfigurator = zeusConfigurator;
    }

    public SefazCompanyDataDto Consultar(byte[] certBytes, string certPassword, string uf, string? targetCnpj = null)
    {
        using var certificado = _zeusConfigurator.LoadCertificate(certBytes, certPassword);

        var cnpjConsulta = targetCnpj;
        if (string.IsNullOrWhiteSpace(cnpjConsulta))
        {
            var match = Regex.Match(certificado.Subject, @"([0-9]{14})");
            if (!match.Success)
                throw new InvalidOperationException("CNPJ (14 dígitos) não foi encontrado no Certificado Digital.");
            cnpjConsulta = match.Groups[1].Value;
        }

        if (!Enum.TryParse<Estado>(uf.ToUpper(), out var estadoEnum))
            throw new ArgumentException($"UF '{uf}' é inválida.");

        var cfg = _zeusConfigurator.GetNfeConfiguracao(estadoEnum, DFe.Classes.Flags.TipoAmbiente.Producao);
        using var servicoSefaz = new ServicosNFe(cfg, certificado);
        var retornoSefaz = servicoSefaz.NfeConsultaCadastro(uf.ToUpper(), ConsultaCadastroTipoDocumento.Cnpj, cnpjConsulta);

        if (retornoSefaz?.Retorno?.infCons?.infCad == null)
        {
            var motivo = retornoSefaz?.Retorno?.infCons?.xMotivo ?? "A SEFAZ não retornou os dados cadastrais para este CNPJ/UF.";
            throw new InvalidOperationException($"Erro SEFAZ ({uf}): {motivo}");
        }

        var cad = retornoSefaz.Retorno.infCons.infCad;
        return new SefazCompanyDataDto(
            Cnpj: cnpjConsulta,
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
            CertificateExpiration: certificado.NotAfter.ToUniversalTime()
        );
    }
}