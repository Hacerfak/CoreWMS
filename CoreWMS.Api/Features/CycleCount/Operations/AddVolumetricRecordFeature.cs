using System.Security.Claims;
using CoreWMS.Api.Features.CycleCount.Enums;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.CycleCount.Operations;

public record AddVolumetricRecordCommand(Guid TaskId, decimal CountedQuantity) : IRequest<IResult>;

public class AddVolumetricRecordCommandValidator : AbstractValidator<AddVolumetricRecordCommand>
{
    public AddVolumetricRecordCommandValidator()
    {
        RuleFor(x => x.TaskId).NotEmpty();
        RuleFor(x => x.CountedQuantity).GreaterThanOrEqualTo(0).WithMessage("A quantidade contada não pode ser negativa.");
    }
}

public class AddVolumetricRecordHandler : IRequestHandler<AddVolumetricRecordCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly IHttpContextAccessor _http;

    public AddVolumetricRecordHandler(ApplicationDbContext db, ITenantProvider tenant, IHttpContextAccessor http)
    {
        _db = db;
        _tenant = tenant;
        _http = http;
    }

    public async Task<IResult> Handle(AddVolumetricRecordCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        if (_tenant.IsPartnerUser())
            return Results.Forbid();

        var userIdClaim = _http.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return Results.Unauthorized();

        var task = await _db.CycleCountTasks
            .Include(t => t.CycleCountPlan)
                .ThenInclude(p => p.Tasks)
            .FirstOrDefaultAsync(t => t.Id == request.TaskId && t.CycleCountPlan.CompanyId == companyId, ct);

        if (task == null)
            return Results.NotFound(new { Message = "Tarefa de inventário não encontrada." });

        if (task.Status == CycleCountTaskStatus.Resolved)
            return Results.BadRequest(new { Message = "Esta tarefa já foi concluída e conciliada." });

        if (task.CycleCountPlan.Status == CycleCountPlanStatus.Draft)
            return Results.BadRequest(new { Message = "Este inventário está em Rascunho e aguarda aprovação da Gestão." });

        task.CycleCountPlan.StartCounting();
        task.RecordRoundCount(request.CountedQuantity, userId, task.CycleCountPlan.MaxRounds);
        task.CycleCountPlan.CheckCompletion();

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Status = task.Status.ToString(),
            task.CurrentRound,
            task.AdjustmentType,
            IsResolved = task.Status == CycleCountTaskStatus.Resolved,
            IsDivergent = task.Status == CycleCountTaskStatus.CountedWithDivergence,
            Message = "Apontamento volumétrico registrado com sucesso."
        });
    }
}

public static class AddVolumetricRecordEndpoints
{
    public static void MapAddVolumetricRecordEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/cycle-count/tasks/{taskId:guid}/record-volumetric", async (Guid taskId, AddVolumetricRecordCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { TaskId = taskId }))
           .WithTags("CycleCount")
           .RequireAuthorization()
           .RequirePermission(Permissions.CycleCount.Count);
    }
}