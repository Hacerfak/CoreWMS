using System.Text;
using System.Text.Json;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Queries;

public record ExportBillingCycleStatementQuery(Guid Id) : IRequest<IResult>;

public class ExportBillingCycleStatementHandler : IRequestHandler<ExportBillingCycleStatementQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ExportBillingCycleStatementHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ExportBillingCycleStatementQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var cycle = await _db.BillingCycles.AsNoTracking()
            .Include(c => c.Customer)
            .Include(c => c.Items)
                .ThenInclude(i => i.BillingService)
            .Where(c => c.Id == request.Id && c.CompanyId == companyId)
            .FirstOrDefaultAsync(ct);

        if (cycle == null) return Results.NotFound();

        var builder = new StringBuilder();

        // 1. CABEÇALHO DO EXTRATO
        builder.AppendLine($"EXTRATO DE FATURAMENTO WMS;Competência: {cycle.ReferenceMonth}");
        builder.AppendLine($"Depositante;\"{cycle.Customer.CorporateName}\"");
        builder.AppendLine($"CNPJ;\"{cycle.Customer.Cnpj}\"");
        builder.AppendLine($"Período de Apuração;{cycle.StartDate:dd/MM/yyyy} a {cycle.EndDate:dd/MM/yyyy}");
        builder.AppendLine($"Situação da Fatura;{cycle.Status}");
        builder.AppendLine($"Valor Total Geral R$;{cycle.TotalAmount:N2}");
        builder.AppendLine();

        // 2. SEÇÃO 1: RESUMO CONSOLIDADO POR SERVIÇO
        builder.AppendLine("--- 1. RESUMO GERAL DOS SERVIÇOS ---");
        builder.AppendLine("Serviço / Lançamento;Tipo;Volume / Quantidade;Valor Total R$;Observações");

        foreach (var item in cycle.Items.OrderBy(i => i.CreatedAt))
        {
            var serviceType = item.BillingService?.Type.ToString() ?? "Avulso";
            var desc = item.Description;
            var notes = item.ManualNotes ?? "";
            builder.AppendLine($"\"{desc}\";{serviceType};{item.QuantityTotal};{item.ServiceTotal:N2};\"{notes}\"");
        }

        builder.AppendLine();

        // 3. SEÇÃO 2: DETALHAMENTO ANALÍTICO DAS OCORRÊNCIAS (JSON DESCOMPACTADO)
        builder.AppendLine("--- 2. DETALHAMENTO ANALÍTICO DAS OCORRÊNCIAS (AUDITORIA LINHA A LINHA) ---");
        builder.AppendLine("Serviço;Data / Referência;Tipo Volume;Detalhe / Documento;Quantidade;Valor Cobrado R$");

        foreach (var item in cycle.Items.Where(i => !string.IsNullOrWhiteSpace(i.StatementDataJson)))
        {
            try
            {
                using var jsonDoc = JsonDocument.Parse(item.StatementDataJson!);
                if (jsonDoc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var elem in jsonDoc.RootElement.EnumerateArray())
                    {
                        string dataRef = elem.TryGetProperty("DATA", out var dProp) ? dProp.ToString() : item.CreatedAt.ToString("dd/MM/yyyy");
                        string tipoVol = elem.TryGetProperty("TIPO_VOLUME", out var tvProp) ? tvProp.ToString() : "-";
                        string docRef = elem.TryGetProperty("DESCRICAO", out var descProp) ? descProp.ToString() : (elem.TryGetProperty("OrderNumber", out var onProp) ? $"Ped #{onProp}" : "-");
                        string qtd = elem.TryGetProperty("VOLUME", out var vProp) ? vProp.ToString() : (elem.TryGetProperty("VolumeCount", out var vcProp) ? vcProp.ToString() : "1");
                        string val = elem.TryGetProperty("VALOR_TOTAL", out var valProp) ? valProp.ToString() : (elem.TryGetProperty("VALOR_DIARIA", out var vdProp) ? vdProp.ToString() : item.ServiceTotal.ToString("N2"));

                        builder.AppendLine($"\"{item.Description}\";{dataRef};{tipoVol};\"{docRef}\";{qtd};{val}");
                    }
                }
            }
            catch
            {
                builder.AppendLine($"\"{item.Description}\";{item.CreatedAt:dd/MM/yyyy};-;\"Lançamento registrado\";{item.QuantityTotal};{item.ServiceTotal:N2}");
            }
        }

        var preamble = Encoding.UTF8.GetPreamble();
        var contentBytes = Encoding.UTF8.GetBytes(builder.ToString());
        var fileBytes = preamble.Concat(contentBytes).ToArray();

        var fileName = $"extrato_faturamento_{cycle.Customer.Cnpj}_{cycle.ReferenceMonth.Replace("/", "_")}.csv";
        return Results.File(fileBytes, "text/csv; charset=utf-8", fileName);
    }
}

public static class ExportBillingCycleStatementEndpoints
{
    public static void MapExportBillingCycleStatementEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/billing/cycles/{id:guid}/export", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ExportBillingCycleStatementQuery(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);
    }
}