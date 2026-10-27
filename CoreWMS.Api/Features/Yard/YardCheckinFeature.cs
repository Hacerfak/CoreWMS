using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Yard;

public record YardCheckinCommand(
    string CodeOrPlate,
    string? Plate = null,
    string? Driver = null,
    string? Cpf = null,
    Guid? DockLocationId = null
) : IRequest<IResult>;

public class YardCheckinCommandValidator : AbstractValidator<YardCheckinCommand>
{
    public YardCheckinCommandValidator()
    {
        RuleFor(x => x.CodeOrPlate).NotEmpty().WithMessage("Informe o código de reserva ou a placa do veículo.");
    }
}

public class YardCheckinHandler : IRequestHandler<YardCheckinCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public YardCheckinHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(YardCheckinCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var cleanTerm = request.CodeOrPlate.Trim().ToUpper();

        var appointment = await _db.YardAppointments
            .FirstOrDefaultAsync(y => y.CompanyId == companyId &&
                (y.ReservationCode == cleanTerm || (y.VehiclePlate != null && y.VehiclePlate == cleanTerm)), ct);

        if (appointment == null)
            return Results.NotFound(new { Message = $"Nenhum agendamento localizado para '{cleanTerm}'." });

        try
        {
            appointment.CheckIn(request.Plate, request.Driver, request.Cpf, request.DockLocationId);
            await _db.SaveChangesAsync(ct);

            return Results.Ok(new
            {
                appointment.Id,
                appointment.ReservationCode,
                appointment.VehiclePlate,
                appointment.DriverName,
                Status = appointment.Status.ToString(),
                ArrivedAt = appointment.ArrivedAt,
                Message = $"Entrada do veículo {appointment.VehiclePlate} confirmada com sucesso!"
            });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class YardCheckinEndpoints
{
    public static void MapYardCheckinEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/yard/checkin", async (YardCheckinCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
            .WithTags("Yard")
            .RequireAuthorization()
            .RequirePermission(Permissions.Yard.Operate);
    }
}