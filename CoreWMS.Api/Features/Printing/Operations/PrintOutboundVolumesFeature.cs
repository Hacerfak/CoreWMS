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

public record PrintOutboundVolumesCommand(
    List<Guid> VolumeIds,
    Guid TemplateId,
    string StationName,
    string PrinterName
) : IRequest<IResult>;

public class PrintOutboundVolumesCommandValidator : AbstractValidator<PrintOutboundVolumesCommand>
{
    public PrintOutboundVolumesCommandValidator()
    {
        RuleFor(x => x.VolumeIds).NotEmpty().WithMessage("Informe ao menos um volume para impressão.");
        RuleFor(x => x.TemplateId).NotEmpty().WithMessage("O template de etiqueta é obrigatório.");
        RuleFor(x => x.StationName).NotEmpty().WithMessage("A estação (agente de impressão) é obrigatória.");
        RuleFor(x => x.PrinterName).NotEmpty().WithMessage("A impressora é obrigatória.");
    }
}

public class PrintOutboundVolumesHandler : IRequestHandler<PrintOutboundVolumesCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IPrintService _printService;
    private readonly IZplTemplateEngine _zplEngine;

    public PrintOutboundVolumesHandler(
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

    public async Task<IResult> Handle(PrintOutboundVolumesCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var template = await _db.LabelTemplates
            .AsNoTracking()
            .FirstOrDefaultAsync(t => t.Id == request.TemplateId, ct);

        if (template == null)
            return Results.BadRequest(new { Message = "Template de etiqueta não encontrado." });

        var volumes = await _db.OutboundVolumes
            .AsNoTracking()
            .Include(v => v.PackagingType)
            .Include(v => v.OutboundOrder)
                .ThenInclude(o => o.Customer)
            .Where(v => request.VolumeIds.Contains(v.Id) && v.OutboundOrder.CompanyId == companyId)
            .ToListAsync(ct);

        if (!volumes.Any())
            return Results.NotFound(new { Message = "Nenhum volume encontrado para impressão." });

        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            if (volumes.Any(v => !allowedCustomerIds.Contains(v.OutboundOrder.CustomerId)))
                return Results.Forbid();
        }

        var printer = await _db.Printers
            .Include(p => p.PrintAgent)
            .FirstOrDefaultAsync(p => p.PrintAgent.Name == request.StationName && p.Name == request.PrinterName, ct);

        var targetHardware = printer?.Target ?? request.PrinterName;

        var combinedZpl = new StringBuilder();
        foreach (var volume in volumes)
        {
            var renderedZpl = _zplEngine.RenderOutboundVolumeTemplate(template.ZplContent, volume.OutboundOrder, volume);
            combinedZpl.AppendLine(renderedZpl);
        }

        var jobId = await _printService.SendPrintJobAsync(request.StationName, targetHardware, combinedZpl.ToString());

        return Results.Ok(new
        {
            Message = $"{volumes.Count} etiqueta(s) de volume enviada(s) para impressão com sucesso.",
            JobId = jobId,
            TargetStation = request.StationName,
            ResolvedTarget = targetHardware
        });
    }
}

public static class PrintOutboundVolumesEndpoints
{
    public static void MapPrintOutboundVolumesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/print/outbound-volumes", async ([FromBody] PrintOutboundVolumesCommand command, IMediator mediator) =>
            await mediator.Send(command))
        .WithTags("Printing")
        .RequireAuthorization()
        .RequirePermission(Permissions.Printing.Manage);
    }
}