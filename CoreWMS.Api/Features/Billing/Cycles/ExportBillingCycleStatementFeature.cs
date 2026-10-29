using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Billing.Documents;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Queries;

public record ExportBillingCycleStatementQuery(Guid Id) : IRequest<IResult>;
public record ExportBillingCycleCsvQuery(Guid Id) : IRequest<IResult>;

public class ExportBillingCycleStatementHandler :
    IRequestHandler<ExportBillingCycleStatementQuery, IResult>,
    IRequestHandler<ExportBillingCycleCsvQuery, IResult>
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

        if (cycle == null)
            return Results.NotFound(new { Message = "Ciclo de faturamento não encontrado." });

        var company = await _db.Companies.AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == companyId, ct);

        var tz = GetBrasiliaTimeZone();
        var emissaoLocal = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, tz);

        string html = BillingCycleHtmlGenerator.Generate(cycle, company, emissaoLocal);
        return Results.Content(html, "text/html; charset=utf-8");
    }

    public async Task<IResult> Handle(ExportBillingCycleCsvQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var cycle = await _db.BillingCycles.AsNoTracking()
            .Include(c => c.Customer)
            .Include(c => c.Items)
                .ThenInclude(i => i.BillingService)
            .Where(c => c.Id == request.Id && c.CompanyId == companyId)
            .FirstOrDefaultAsync(ct);

        if (cycle == null)
            return Results.NotFound(new { Message = "Ciclo de faturamento não encontrado." });

        byte[] csvBytes = BillingCycleCsvGenerator.Generate(cycle);

        var refMonthClean = (cycle.ReferenceMonth ?? "extrato").Replace("/", "_");
        var clientClean = (cycle.Customer?.CorporateName ?? "cliente").Replace(" ", "_").ToLower();
        var fileName = $"extrato_faturamento_{clientClean}_{refMonthClean}.csv";

        return Results.File(csvBytes, "text/csv; charset=utf-8", fileName);
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

public static class ExportBillingCycleStatementEndpoints
{
    public static void MapExportBillingCycleStatementEndpoints(this IEndpointRouteBuilder app)
    {
        // 1. Extrato Oficial em HTML (Impressão & Visualização Direta)
        app.MapGet("/api/billing/cycles/{id:guid}/statement-html", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ExportBillingCycleStatementQuery(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);

        // 2. Exportação Analítica em CSV (Para Tabelas Dinâmicas no Excel)
        app.MapGet("/api/billing/cycles/{id:guid}/export-csv", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ExportBillingCycleCsvQuery(id)))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.View);
    }
}