using System.Text;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Import;
using CoreWMS.Api.Features.Outbound.Import;
using CoreWMS.Api.Features.Yard.Entities;
using CoreWMS.Api.Features.Yard.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record CreateYardAppointmentFromXmlCommand(
    byte[] FileBytes,
    YardAppointmentType Type,
    DateTime? ScheduledDate,
    string? DriverName,
    string? DriverCpf,
    string? VehiclePlateOverride,
    string? VehiclePlateState,
    string? CarrierName,
    string? CarrierCnpj,
    string? InvoiceNumber,
    string? InvoiceSerie,
    Guid? DockLocationId,
    string? AdditionalNotes,
    bool DirectCheckIn = false
) : IRequest<IResult>;

public class CreateYardAppointmentFromXmlHandler : IRequestHandler<CreateYardAppointmentFromXmlCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly INfeParserService _parser;
    private readonly IMediator _mediator;

    public CreateYardAppointmentFromXmlHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        INfeParserService parser,
        IMediator mediator)
    {
        _db = db;
        _tenant = tenant;
        _parser = parser;
        _mediator = mediator;
    }

    public async Task<IResult> Handle(CreateYardAppointmentFromXmlCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        string xmlString;
        try { xmlString = Encoding.UTF8.GetString(request.FileBytes); }
        catch { return Results.BadRequest(new { Message = "Arquivo XML inválido ou corrompido." }); }

        var parsedNfe = _parser.ParseXml(xmlString);

        string plate = !string.IsNullOrWhiteSpace(request.VehiclePlateOverride)
            ? request.VehiclePlateOverride.Trim().ToUpper()
            : (parsedNfe.VehiclePlate ?? string.Empty);

        string uf = !string.IsNullOrWhiteSpace(request.VehiclePlateState)
            ? request.VehiclePlateState.Trim().ToUpper()
            : (parsedNfe.VehiclePlateState ?? "RS");

        DateTime schedule = request.ScheduledDate ?? DateTime.UtcNow;

        Guid? createdInboundId = null;
        Guid? createdOutboundId = null;

        // 1. FLUXO ENTRADA: Cria a InboundOrder automaticamente
        if (request.Type == YardAppointmentType.Inbound)
        {
            var importRes = await _mediator.Send(new ImportInboundXmlCommand(new List<string> { xmlString }), ct);

            var createdInbound = await _db.InboundOrders
                .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct);

            if (createdInbound == null)
            {
                return Results.BadRequest(new
                {
                    Message = "O XML foi processado mas a Ordem de Entrada não pôde ser criada. Verifique se o CNPJ do destinatário da NF-e é idêntico ao da sua empresa cadastrada."
                });
            }

            createdInboundId = createdInbound.Id;
        }
        // 2. FLUXO SAÍDA: Cria a OutboundOrder automaticamente
        else if (request.Type == YardAppointmentType.Outbound)
        {
            var importRes = await _mediator.Send(new ImportOutboundOrderCommand(request.FileBytes), ct);

            var createdOutbound = await _db.OutboundOrders
                .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct);

            if (createdOutbound == null)
            {
                return Results.BadRequest(new
                {
                    Message = "O XML foi processado mas a Ordem de Saída não pôde ser criada. Verifique se o emitente da NF-e já está cadastrado como cliente depositante nesta empresa."
                });
            }

            createdOutboundId = createdOutbound.Id;
        }

        // 3. Instancia o Agendamento amarrado à Ordem criada
        var appointment = new YardAppointment(
            companyId,
            request.Type,
            schedule,
            vehiclePlate: plate,
            vehiclePlateState: uf,
            driverName: request.DriverName,
            driverCpf: request.DriverCpf,
            carrierName: request.CarrierName ?? parsedNfe.CarrierName,
            carrierCnpj: request.CarrierCnpj ?? parsedNfe.CarrierCnpjCpf,
            accessKey: parsedNfe.AccessKey,
            invoiceNumber: request.InvoiceNumber ?? parsedNfe.InvoiceNumber,
            invoiceSerie: request.InvoiceSerie ?? parsedNfe.InvoiceSerie,
            additionalNotes: request.AdditionalNotes ?? $"Importado via XML na portaria ({parsedNfe.AccessKey})",
            dockLocationId: request.DockLocationId,
            inboundOrderId: createdInboundId,
            outboundOrderId: createdOutboundId
        );

        if (request.DirectCheckIn)
        {
            appointment.CheckIn(plate, request.DriverName, request.DriverCpf, request.DockLocationId);
        }

        _db.YardAppointments.Add(appointment);

        // 4. Garante a amarração bidirecional nas ordens
        if (createdInboundId.HasValue)
        {
            var inb = await _db.InboundOrders.FindAsync(new object[] { createdInboundId.Value }, ct);
            inb?.LinkYardAppointment(appointment.Id);
        }
        else if (createdOutboundId.HasValue)
        {
            var outb = await _db.OutboundOrders.FindAsync(new object[] { createdOutboundId.Value }, ct);
            outb?.LinkYardAppointment(appointment.Id);
        }

        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/yard/appointments/{appointment.Id}", new
        {
            appointment.Id,
            appointment.ReservationCode,
            appointment.AccessKey,
            InboundOrderId = createdInboundId,
            OutboundOrderId = createdOutboundId,
            Message = "Ordem gerada e agendamento vinculado com sucesso a partir do XML!"
        });
    }
}

public static class CreateYardAppointmentFromXmlEndpoints
{
    public static void MapCreateYardAppointmentFromXmlEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/yard/appointments/import-xml", async (
            HttpRequest request,
            IMediator mediator) =>
        {
            var form = await request.ReadFormAsync();
            var file = form.Files.GetFile("file");

            if (file == null || file.Length == 0)
                return Results.BadRequest(new { Message = "Arquivo XML obrigatório." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);

            var type = int.TryParse(form["type"], out var tVal) ? (YardAppointmentType)tVal : YardAppointmentType.Inbound;
            var scheduledDate = DateTime.TryParse(form["scheduledDate"], out var dtVal) ? dtVal : (DateTime?)null;
            var driverName = form["driverName"].ToString();
            var driverCpf = form["driverCpf"].ToString();
            var vehiclePlate = form["vehiclePlate"].ToString();
            var vehiclePlateState = form["vehiclePlateState"].ToString();
            var carrierName = form["carrierName"].ToString();
            var carrierCnpj = form["carrierCnpj"].ToString();
            var invoiceNumber = form["invoiceNumber"].ToString();
            var invoiceSerie = form["invoiceSerie"].ToString();
            var additionalNotes = form["additionalNotes"].ToString();
            var directCheckIn = bool.TryParse(form["directCheckIn"], out var dcVal) && dcVal;
            Guid? dockLocationId = Guid.TryParse(form["dockLocationId"], out var dId) ? dId : null;

            return await mediator.Send(new CreateYardAppointmentFromXmlCommand(
                ms.ToArray(),
                type,
                scheduledDate,
                driverName,
                driverCpf,
                vehiclePlate,
                vehiclePlateState,
                carrierName,
                carrierCnpj,
                invoiceNumber,
                invoiceSerie,
                dockLocationId,
                additionalNotes,
                directCheckIn
            ));
        })
        .WithTags("Yard")
        .RequireAuthorization()
        .RequirePermission(Permissions.Yard.Manage)
        .DisableAntiforgery();
    }
}