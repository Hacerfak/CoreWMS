using System.Globalization;
using System.Text;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

public record ExportCycleCountPlanQuery(Guid PlanId) : IRequest<IResult>;

public class ExportCycleCountPlanHandler : IRequestHandler<ExportCycleCountPlanQuery, IResult>
{
    private static readonly CultureInfo PtBrCulture = CultureInfo.GetCultureInfo("pt-BR");
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ExportCycleCountPlanHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ExportCycleCountPlanQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var isPartner = _tenant.IsPartnerUser();
        var allowedCustomerIds = isPartner ? _tenant.GetAllowedCustomerIds() : new List<Guid>();

        var plan = await _db.CycleCountPlans.AsNoTracking()
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Location)
            .Include(p => p.Tasks)
                .ThenInclude(t => t.Product)
                    .ThenInclude(pr => pr.Customer)
            .FirstOrDefaultAsync(p => p.Id == request.PlanId && p.CompanyId == companyId, ct);

        if (plan == null)
            return Results.NotFound(new { Message = "Plano de inventário não encontrado." });

        if (isPartner && plan.Status == CycleCountPlanStatus.Draft)
            return Results.Forbid();

        var tasks = isPartner
            ? plan.Tasks.Where(t => allowedCustomerIds.Contains(t.Product.CustomerId)).ToList()
            : plan.Tasks.ToList();

        if (isPartner && !tasks.Any())
            return Results.Forbid();

        var builder = new StringBuilder();
        builder.AppendLine("Plano;StatusPlano;Endereco;Depositante;SKU;DescricaoProduto;Unidade;LPNBipado;RodadaAtual;StatusTarefa;QtdSistema;QtdContada;Divergencia;Rodada1;Rodada2;Rodada3;TipoAjuste;DocumentoFiscal;Observacoes");

        foreach (var t in tasks.OrderBy(x => x.Location.FullPath).ThenBy(x => x.Product.Sku))
        {
            var expectedStr = t.ExpectedQuantity.ToString("0.00######", PtBrCulture);
            var countedStr = t.CountedQuantity.HasValue ? t.CountedQuantity.Value.ToString("0.00######", PtBrCulture) : "";
            var divStr = t.CountedQuantity.HasValue ? t.DivergenceQuantity.ToString("0.00######", PtBrCulture) : "";
            var r1Str = t.CountRound1.HasValue ? t.CountRound1.Value.ToString("0.00######", PtBrCulture) : "";
            var r2Str = t.CountRound2.HasValue ? t.CountRound2.Value.ToString("0.00######", PtBrCulture) : "";
            var r3Str = t.CountRound3.HasValue ? t.CountRound3.Value.ToString("0.00######", PtBrCulture) : "";

            builder.AppendLine(
                $"\"{plan.Name}\";\"{plan.Status}\";\"{t.Location.FullPath}\";\"{t.Product.Customer?.CorporateName ?? ""}\";\"{t.Product.Sku}\";\"{t.Product.Description}\";\"{t.Product.BaseUnit}\";\"{t.ScannedLpn ?? ""}\";{t.CurrentRound};\"{t.Status}\";{expectedStr};{countedStr};{divStr};{r1Str};{r2Str};{r3Str};\"{t.AdjustmentType}\";\"{t.FiscalDocumentNumber ?? ""}\";\"{t.FiscalNotes ?? ""}\""
            );
        }

        var fileBytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(builder.ToString())).ToArray();
        var fileName = $"extrato_inventario_{plan.Id.ToString()[..8]}_{DateTime.UtcNow:yyyyMMdd_HHmmss}.csv";

        return Results.File(fileBytes, "text/csv; charset=utf-8", fileName);
    }
}

public static class ExportCycleCountPlanEndpoints
{
    public static void MapExportCycleCountPlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/plans/{id:guid}/export", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ExportCycleCountPlanQuery(id)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.CycleCount.Export);
    }
}