using System.Text;
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
        builder.AppendLine($"EXTRATO DE FATURAMENTO WMS;Ref: {cycle.ReferenceMonth}");
        builder.AppendLine($"Depositante;\"{cycle.Customer.CorporateName}\"");
        builder.AppendLine($"CNPJ;\"{cycle.Customer.Cnpj}\"");
        builder.AppendLine($"Periodo;{cycle.StartDate:dd/MM/yyyy} a {cycle.EndDate:dd/MM/yyyy}");
        builder.AppendLine($"Status;{cycle.Status}");
        builder.AppendLine($"Valor Total R$;{cycle.TotalAmount:N2}");
        builder.AppendLine();
        builder.AppendLine("Servico / Item;Quantidade Total;Valor Total R$;Observacoes");

        foreach (var item in cycle.Items)
        {
            var desc = item.BillingService?.Name ?? item.Description;
            var notes = item.ManualNotes ?? "";
            builder.AppendLine($"\"{desc}\";{item.QuantityTotal};{item.ServiceTotal:N2};\"{notes}\"");
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