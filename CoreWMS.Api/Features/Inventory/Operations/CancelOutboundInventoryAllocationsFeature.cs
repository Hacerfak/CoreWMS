using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Operations;

public record CancelAllocationItemDto(
    Guid ProductId,
    decimal Quantity,
    Guid? HandlingUnitId
);

public record CancelOutboundInventoryAllocationsCommand(
    Guid CustomerId,
    Guid? TargetLocationId,
    List<CancelAllocationItemDto> Allocations
) : IRequest<IResult>;

public class CancelOutboundInventoryAllocationsCommandValidator : AbstractValidator<CancelOutboundInventoryAllocationsCommand>
{
    public CancelOutboundInventoryAllocationsCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithMessage("Depositante obrigatório.");
        RuleFor(x => x.Allocations).NotEmpty().WithMessage("Nenhuma alocação informada.");
    }
}

public class CancelOutboundInventoryAllocationsHandler : IRequestHandler<CancelOutboundInventoryAllocationsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public CancelOutboundInventoryAllocationsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(CancelOutboundInventoryAllocationsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Resolução do endereço de destino para devolução das HUs
        var targetLocationId = request.TargetLocationId;
        if (!targetLocationId.HasValue)
        {
            targetLocationId = await _db.Set<Location>()
                .Where(l => l.IsActive)
                .Select(l => (Guid?)l.Id)
                .FirstOrDefaultAsync(ct);
        }

        var productIds = request.Allocations.Select(a => a.ProductId).Distinct().ToList();
        var huIds = request.Allocations
            .Where(a => a.HandlingUnitId.HasValue)
            .Select(a => a.HandlingUnitId!.Value)
            .Distinct()
            .ToList();

        // 2. Busca saldos de estoque correspondentes
        var balances = await _db.InventoryBalances
            .Where(b => b.CompanyId == companyId && productIds.Contains(b.ProductId) && b.CustomerId == request.CustomerId)
            .ToListAsync(ct);

        // 3. Busca HUs envolvidas
        var hus = huIds.Any()
            ? await _db.HandlingUnits.Where(h => h.CompanyId == companyId && huIds.Contains(h.Id)).ToListAsync(ct)
            : new List<HandlingUnit>();

        // 4. Executa a libertação de reservas e restauração de HUs
        foreach (var alloc in request.Allocations)
        {
            var balance = balances.FirstOrDefault(b => b.ProductId == alloc.ProductId && b.CustomerId == request.CustomerId);
            if (balance != null)
            {
                balance.UnallocateForPicking(alloc.Quantity);
            }

            if (alloc.HandlingUnitId.HasValue)
            {
                var hu = hus.FirstOrDefault(h => h.Id == alloc.HandlingUnitId.Value);
                if (hu != null && hu.Status == HuStatus.Consumed)
                {
                    hu.RestoreConsumed(alloc.Quantity, targetLocationId);
                }
            }
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Reservas de picking estornadas e HUs reativadas com sucesso." });
    }
}

public static class CancelOutboundInventoryAllocationsEndpoints
{
    public static void MapCancelOutboundInventoryAllocationsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inventory/outbound/cancel-allocations", async ([FromBody] CancelOutboundInventoryAllocationsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.Move);
    }
}