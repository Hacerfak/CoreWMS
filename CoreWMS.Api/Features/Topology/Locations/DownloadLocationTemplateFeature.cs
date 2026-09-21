using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;

namespace CoreWMS.Api.Features.Topology.Locations;

public record DownloadLocationTemplateQuery() : IRequest<IResult>;

public class DownloadLocationTemplateHandler : IRequestHandler<DownloadLocationTemplateQuery, IResult>
{
    public Task<IResult> Handle(DownloadLocationTemplateQuery request, CancellationToken ct)
    {
        var csv = "Armazem_Codigo;Zona_Codigo;Posicao_Codigo;TipoArmazenagem_Nome;Capacidade\n" +
                  "P1;C1;B01;Blocado Padrão;10\n" +
                  "P1;C1;B02;Porta-Pallet Frio;1";

        var bytes = Encoding.UTF8.GetBytes(csv);

        return Task.FromResult(Results.File(bytes, "text/csv", "Modelo_Importacao_Enderecos.csv"));
    }
}

public static class DownloadLocationTemplateEndpoints
{
    public static void MapDownloadLocationTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/topology/locations/template", async (IMediator mediator) => await mediator.Send(new DownloadLocationTemplateQuery()))
           .WithTags("Topology")
           .RequireAuthorization()
           .RequirePermission(Permissions.Topology.Manage);
    }
}