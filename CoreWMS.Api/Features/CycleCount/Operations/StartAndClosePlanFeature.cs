using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record StartCycleCountPlanCommand(Guid Id) : IRequest<IResult>;
public record CloseCycleCountPlanCommand(Guid Id) : IRequest<IResult>;

public class StartAndClosePlanHandler :
    IRequestHandler<StartCycleCountPlanCommand, IResult>,
    IRequestHandler<CloseCycleCountPlanCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public StartAndClosePlanHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(StartCycleCountPlanCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        if (_tenant.IsPartnerUser()) return Results.Forbid();

        var plan = await _db.CycleCountPlans
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (plan == null)
            return Results.NotFound(new { Message = "Plano de inventário não encontrado." });

        if (plan.Status == CycleCountPlanStatus.Draft)
        {
            plan.ApproveForCounting();
        }
        else
        {
            plan.StartCounting();
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Message = "Plano de inventário iniciado e liberado para contagem." });
    }

    public async Task<IResult> Handle(CloseCycleCountPlanCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        if (_tenant.IsPartnerUser()) return Results.Forbid();

        var plan = await _db.CycleCountPlans
            .Include(p => p.Tasks)
            .FirstOrDefaultAsync(p => p.Id == request.Id && p.CompanyId == companyId, ct);

        if (plan == null)
            return Results.NotFound(new { Message = "Plano de inventário não encontrado." });

        try
        {
            plan.Close();
            await _db.SaveChangesAsync(ct);
            return Results.Ok(new { Message = "Plano de inventário encerrado com sucesso." });
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { Message = ex.Message });
        }
    }
}

public static class StartAndClosePlanEndpoints
{
    public static void MapStartAndClosePlanEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/plans/{id:guid}/start", async (Guid id, IMediator mediator) =>
            await mediator.Send(new StartCycleCountPlanCommand(id)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.CycleCount.Manage);

        app.MapPost("/api/cycle-count/plans/{id:guid}/close", async (Guid id, IMediator mediator) =>
            await mediator.Send(new CloseCycleCountPlanCommand(id)))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.CycleCount.Manage);
    }
}