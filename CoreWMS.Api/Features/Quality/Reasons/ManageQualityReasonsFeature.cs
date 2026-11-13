using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Reasons;

public record UpdateQualityReasonCommand(Guid Id, string Code, string Description, bool IsActive) : IRequest<IResult>;
public record ToggleQualityReasonStatusCommand(Guid Id) : IRequest<IResult>;
public record DeleteQualityReasonCommand(Guid Id) : IRequest<IResult>;

public class UpdateQualityReasonCommandValidator : AbstractValidator<UpdateQualityReasonCommand>
{
    public UpdateQualityReasonCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Code).NotEmpty().WithMessage("Informe o código do motivo.").MaximumLength(20);
        RuleFor(x => x.Description).NotEmpty().WithMessage("Informe a descrição do motivo.").MaximumLength(150);
    }
}

public class ManageQualityReasonsHandler :
    IRequestHandler<UpdateQualityReasonCommand, IResult>,
    IRequestHandler<ToggleQualityReasonStatusCommand, IResult>,
    IRequestHandler<DeleteQualityReasonCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ManageQualityReasonsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateQualityReasonCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var cleanCode = request.Code.ToUpper().Trim();

        var reason = await _db.QualityReasons
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (reason == null)
            return Results.NotFound(new { Message = "Motivo de qualidade não encontrado." });

        bool codeExists = await _db.QualityReasons
            .AnyAsync(r => r.Id != request.Id && r.CompanyId == companyId && r.Code == cleanCode, ct);

        if (codeExists)
            return Results.BadRequest(new { Message = $"Já existe outro motivo cadastrado com o código '{cleanCode}'." });

        reason.Update(cleanCode, request.Description, request.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new QualityReasonDto(reason.Id, reason.Code, reason.Description, reason.IsActive));
    }

    public async Task<IResult> Handle(ToggleQualityReasonStatusCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var reason = await _db.QualityReasons
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (reason == null)
            return Results.NotFound(new { Message = "Motivo de qualidade não encontrado." });

        reason.ToggleActive();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            reason.Id,
            reason.IsActive,
            Message = reason.IsActive ? "Motivo ativado com sucesso." : "Motivo inativado com sucesso."
        });
    }

    public async Task<IResult> Handle(DeleteQualityReasonCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var reason = await _db.QualityReasons
            .FirstOrDefaultAsync(r => r.Id == request.Id && r.CompanyId == companyId, ct);

        if (reason == null)
            return Results.NotFound(new { Message = "Motivo de qualidade não encontrado." });

        bool isUsed = await _db.QualityEvents
            .AnyAsync(q => q.CompanyId == companyId && (q.HoldReasonId == request.Id || q.ReleaseReasonId == request.Id), ct);

        if (isUsed)
            return Results.BadRequest(new { Message = "Este motivo já está vinculado a ocorrências de qualidade e não pode ser excluído. Utilize a opção Inativar." });

        _db.QualityReasons.Remove(reason);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Motivo excluído com sucesso." });
    }
}

public static class ManageQualityReasonsEndpoints
{
    public static void MapManageQualityReasonsEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/quality/reasons")
            .WithTags("Quality")
            .RequireAuthorization();

        group.MapPut("/{id:guid}", async (Guid id, [FromBody] UpdateQualityReasonCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
            .RequirePermission(Permissions.Inventory.ManageQuality);

        group.MapPatch("/{id:guid}/toggle-active", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ToggleQualityReasonStatusCommand(id)))
            .RequirePermission(Permissions.Inventory.ManageQuality);

        group.MapDelete("/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteQualityReasonCommand(id)))
            .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}