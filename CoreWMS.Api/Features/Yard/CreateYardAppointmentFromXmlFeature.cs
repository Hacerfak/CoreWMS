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
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record CreateYardAppointmentFromXmlCommand(
    byte[] FileBytes,
    YardAppointmentType Type,
    DateTime? ScheduledDate,
    string? DriverName,
    string? DriverCpf,
    string? VehiclePlateOverride
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

        DateTime schedule = request.ScheduledDate ?? DateTime.UtcNow;

        Guid? createdInboundId = null;
        Guid? createdOutboundId = null;

        // 1. FLUXO ENTRADA: Cria a InboundOrder automaticamente
        if (request.Type == YardAppointmentType.Inbound)
        {
            var importRes = await _mediator.Send(new ImportInboundXmlCommand(new List<string> { xmlString }), ct);

            var createdInbound = await _db.InboundOrders
                .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct);

            createdInboundId = createdInbound?.Id;
        }
        // 2. FLUXO SAÍDA: Cria a OutboundOrder automaticamente
        else if (request.Type == YardAppointmentType.Outbound)
        {
            var importRes = await _mediator.Send(new ImportOutboundOrderCommand(request.FileBytes), ct);

            var createdOutbound = await _db.OutboundOrders
                .FirstOrDefaultAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct);

            createdOutboundId = createdOutbound?.Id;
        }

        // 3. Instancia o Agendamento amarrado à Ordem criada
        var appointment = new YardAppointment(
            companyId,
            request.Type,
            schedule,
            vehiclePlate: plate,
            vehiclePlateState: parsedNfe.VehiclePlateState,
            driverName: request.DriverName,
            driverCpf: request.DriverCpf,
            carrierName: parsedNfe.CarrierName,
            carrierCnpj: parsedNfe.CarrierCnpjCpf,
            accessKey: parsedNfe.AccessKey,
            invoiceNumber: parsedNfe.InvoiceNumber,
            invoiceSerie: parsedNfe.InvoiceSerie,
            additionalNotes: $"Importado via XML na portaria ({parsedNfe.AccessKey})",
            dockLocationId: null,
            inboundOrderId: createdInboundId,
            outboundOrderId: createdOutboundId
        );

        _db.YardAppointments.Add(appointment);
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
            IFormFile file,
            YardAppointmentType type,
            DateTime? scheduledDate,
            string? driverName,
            string? driverCpf,
            string? vehiclePlate,
            IMediator mediator) =>
        {
            if (file == null || file.Length == 0)
                return Results.BadRequest(new { Message = "Arquivo XML obrigatório." });

            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);

            return await mediator.Send(new CreateYardAppointmentFromXmlCommand(
                ms.ToArray(), type, scheduledDate, driverName, driverCpf, vehiclePlate
            ));
        })
        .WithTags("Yard")
        .RequireAuthorization()
        .RequirePermission(Permissions.Yard.Manage)
        .DisableAntiforgery();
    }
}