using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing.Operations;

public record PrintHandlingUnitsCommand(
    List<Guid> HandlingUnitIds,
    Guid TemplateId,
    string StationName,
    string PrinterName
) : IRequest<IResult>;

public class PrintHandlingUnitsCommandValidator : AbstractValidator<PrintHandlingUnitsCommand>
{
    public PrintHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Informe ao menos uma HU para impressão.");
        RuleFor(x => x.TemplateId).NotEmpty().WithMessage("O template de etiqueta é obrigatório.");
        RuleFor(x => x.StationName).NotEmpty().WithMessage("A estação (agente de impressão) é obrigatória.");
        RuleFor(x => x.PrinterName).NotEmpty().WithMessage("A impressora é obrigatória.");
    }
}

public class PrintHandlingUnitsHandler : IRequestHandler<PrintHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IPrintService _printService;
    private readonly IZplTemplateEngine _zplEngine;

    public PrintHandlingUnitsHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        IPrintService printService,
        IZplTemplateEngine zplEngine)
    {
        _db = db;
        _tenant = tenant;
        _printService = printService;
        _zplEngine = zplEngine;
    }

    public async Task<IResult> Handle(PrintHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var template = await _db.LabelTemplates
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.TemplateId, ct);

        if (template == null)
            return Results.BadRequest(new { Message = "Template de etiqueta não encontrado." });

        var hus = await _db.HandlingUnits
            .AsNoTracking()
            .Include(h => h.Product)
            .Include(h => h.Customer)
            .Where(h => h.CompanyId == companyId && request.HandlingUnitIds.Contains(h.Id))
            .ToListAsync(ct);

        if (!hus.Any())
            return Results.NotFound(new { Message = "Nenhuma HU encontrada para impressão." });

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            if (hus.Any(h => !allowedCustomerIds.Contains(h.CustomerId)))
                return Results.Forbid();
        }

        var orderIds = hus
            .Where(h => h.ReceiptDocumentId.HasValue)
            .Select(h => h.ReceiptDocumentId!.Value)
            .Distinct()
            .ToList();

        var inboundOrders = await _db.InboundOrders
            .AsNoTracking()
            .Where(o => orderIds.Contains(o.Id))
            .ToDictionaryAsync(o => o.Id, ct);

        var printer = await _db.Printers
            .Include(p => p.PrintAgent)
            .FirstOrDefaultAsync(p => p.PrintAgent.Name == request.StationName && p.Name == request.PrinterName, ct);

        var targetHardware = printer?.Target ?? request.PrinterName;

        var combinedZpl = new StringBuilder();
        foreach (var hu in hus)
        {
            var docNumber = "N/A";

            if (hu.ReceiptDocumentId.HasValue && inboundOrders.TryGetValue(hu.ReceiptDocumentId.Value, out var order))
            {
                if (!string.IsNullOrEmpty(order.AccessKey) && order.AccessKey.Length >= 34 &&
                    long.TryParse(order.AccessKey.Substring(25, 9), out var nfNumber))
                {
                    docNumber = nfNumber.ToString();
                }
            }

            var renderedZpl = _zplEngine.RenderHuTemplate(template.ZplContent, hu, docNumber);
            combinedZpl.AppendLine(renderedZpl);
        }

        var jobId = await _printService.SendPrintJobAsync(request.StationName, targetHardware, combinedZpl.ToString());

        return Results.Ok(new
        {
            Message = $"{hus.Count} etiqueta(s) enviada(s) para impressão com sucesso.",
            JobId = jobId,
            TargetStation = request.StationName,
            ResolvedTarget = targetHardware
        });
    }
}

public static class PrintHandlingUnitsEndpoints
{
    public static void MapPrintHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/print/handling-units", async ([FromBody] PrintHandlingUnitsCommand command, IMediator mediator) =>
            await mediator.Send(command))
        .WithTags("Printing")
        .RequireAuthorization()
        .RequirePermission(Permissions.Inbound.Receive);
    }
}