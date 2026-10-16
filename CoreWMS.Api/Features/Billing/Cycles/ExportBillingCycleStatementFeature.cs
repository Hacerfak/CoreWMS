using CoreWMS.Api.Features.Billing.Documents;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace CoreWMS.Api.Features.Billing.Queries;

public record ExportBillingCyclePdfQuery(Guid Id) : IRequest<IResult>;

public class ExportBillingCyclePdfHandler : IRequestHandler<ExportBillingCyclePdfQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    static ExportBillingCyclePdfHandler()
    {
        // Garante a licença do QuestPDF mesmo se não estiver declarada no Program.cs
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public ExportBillingCyclePdfHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ExportBillingCyclePdfQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var cycle = await _db.BillingCycles.AsNoTracking()
            .Include(c => c.Customer)
            .Include(c => c.Items)
                .ThenInclude(i => i.BillingService)
            .Where(c => c.Id == request.Id && c.CompanyId == companyId)
            .FirstOrDefaultAsync(ct);

        if (cycle == null) return Results.NotFound(new { Message = "Ciclo não encontrado." });

        var tz = GetBrasiliaTimeZone();
        var emissaoLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);

        var document = new BillingCyclePdfDocument(cycle, emissaoLocal);
        var pdfBytes = document.GeneratePdf();

        var safeCnpj = (cycle.Customer?.Cnpj ?? "00000000").Replace(".", "").Replace("/", "").Replace("-", "");
        var safeMonth = cycle.ReferenceMonth.Replace("/", "_");
        var fileName = $"extrato_faturamento_{safeCnpj}_{safeMonth}.pdf";

        return Results.File(pdfBytes, "application/pdf", fileName);
    }

    private static TimeZoneInfo GetBrasiliaTimeZone()
    {
        string[] tzIds = ["America/Sao_Paulo", "E. South America Standard Time", "Central Brazilian Standard Time"];
        foreach (var id in tzIds)
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch { }
        }
        return TimeZoneInfo.CreateCustomTimeZone("Brasilia", TimeSpan.FromHours(-3), "Brasilia", "Brasilia");
    }
}

public static class ExportBillingCyclePdfEndpoints
{
    public static void MapExportBillingCyclePdfEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/billing/cycles/{id:guid}/export-pdf", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ExportBillingCyclePdfQuery(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);
    }
}