using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record UpdateHandlingUnitCommand(
    Guid Id,
    string? Batch,
    DateTime? ManufactureDate,
    DateTime? ExpirationDate,
    string? SerialNumber,
    DateTime? CreatedAt,
    Guid? PackagingTypeId,
    decimal? UnitValue,
    DateTime? ConsumedAt = null
) : IRequest<IResult>;

public class UpdateHandlingUnitCommandValidator : AbstractValidator<UpdateHandlingUnitCommand>
{
    public UpdateHandlingUnitCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("ID da HU obrigatório.");
    }
}

public class UpdateHandlingUnitHandler : IRequestHandler<UpdateHandlingUnitCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateHandlingUnitHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateHandlingUnitCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var hu = await _db.HandlingUnits.FirstOrDefaultAsync(h => h.Id == request.Id && h.CompanyId == companyId, ct);
        if (hu == null) return Results.NotFound(new { Message = "HU não encontrada." });

        if (_tenant.IsPartnerUser() && !_tenant.GetAllowedCustomerIds().Contains(hu.CustomerId))
            return Results.Forbid();

        hu.UpdateFullDetails(
            request.Batch,
            request.ManufactureDate,
            request.ExpirationDate,
            request.SerialNumber,
            request.CreatedAt,
            request.PackagingTypeId,
            request.UnitValue,
            request.ConsumedAt
        );

        try
        {
            await _db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            return Results.Conflict(new { Message = "Esta HU foi alterada por outro usuário simultaneamente. Atualize a tela." });
        }

        return Results.Ok(new { Message = "Dados da HU atualizados com sucesso!" });
    }
}

public static class UpdateHandlingUnitEndpoints
{
    public static void MapUpdateHandlingUnitEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/inventory/handling-units/{id:guid}", async (Guid id, UpdateHandlingUnitCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.EditTraceability);
    }
}