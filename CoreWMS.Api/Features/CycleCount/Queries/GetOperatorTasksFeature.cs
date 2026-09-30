using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Queries;

public record OperatorTaskDto(
    Guid Id,
    Guid PlanId,
    string PlanName,
    Guid LocationId,
    string LocationPath,
    Guid ProductId,
    string ProductSku,
    string ProductDescription,
    int CurrentRound,
    bool IsDynamicStorage,
    string Status
);

public record GetOperatorTasksQuery : IRequest<IResult>;

public class GetOperatorTasksHandler : IRequestHandler<GetOperatorTasksQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public GetOperatorTasksHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(GetOperatorTasksQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var userIdClaim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        Guid.TryParse(userIdClaim, out var currentUserId);

        var query = _db.CycleCountTasks.AsNoTracking()
            .Include(t => t.CycleCountPlan)
            .Include(t => t.Location)
            .Include(t => t.Product)
            .Where(t => t.CycleCountPlan.CompanyId == companyId &&
                        (t.CycleCountPlan.Status == CycleCountPlanStatus.ApprovedForCounting || t.CycleCountPlan.Status == CycleCountPlanStatus.InCounting) &&
                        (t.Status == CycleCountTaskStatus.Pending || t.Status == CycleCountTaskStatus.InCounting));

        // Filtro por Usuário Atribuído (Pool Livre ou Atribuído ao Próprio Usuário)
        query = query.Where(t => !t.AssignedUserId.HasValue || t.AssignedUserId == currentUserId || t.CycleCountPlan.AssignedUserId == currentUserId);

        var tasks = await query
            .OrderBy(t => t.Location.FullPath)
            .Select(t => new OperatorTaskDto(
                t.Id,
                t.CycleCountPlanId,
                t.CycleCountPlan.Name,
                t.LocationId,
                t.Location.FullPath,
                t.ProductId,
                t.Product.Sku,
                t.Product.Description,
                t.CurrentRound,
                t.IsDynamicStorage,
                t.Status.ToString()
            ))
            .ToListAsync(ct);

        return Results.Ok(tasks);
    }
}

public static class GetOperatorTasksEndpoints
{
    public static void MapGetOperatorTasksEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/cycle-count/tasks/operator", async (IMediator mediator) =>
            await mediator.Send(new GetOperatorTasksQuery()))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}