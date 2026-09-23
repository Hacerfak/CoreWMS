using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing.Services;

public record UpdateBillingServiceCommand(Guid Id, string Name, BillingServiceType Type, string? SqlTemplate) : IRequest<IResult>;

public class UpdateBillingServiceCommandValidator : AbstractValidator<UpdateBillingServiceCommand>
{
    public UpdateBillingServiceCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(150);
    }
}

public class UpdateBillingServiceHandler : IRequestHandler<UpdateBillingServiceCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public UpdateBillingServiceHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(UpdateBillingServiceCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var service = await _db.BillingServices
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.CompanyId == companyId, ct);

        if (service == null) return Results.NotFound(new { Message = "Serviço não encontrado." });

        if (request.Type == BillingServiceType.Automatic_SQL && string.IsNullOrWhiteSpace(request.SqlTemplate))
            return Results.BadRequest(new { Message = "Serviços automáticos exigem um template de query SQL." });

        // Atualização dos campos
        service = new BillingService(companyId, request.Name, request.Type, request.SqlTemplate);

        // No EF Core, atualizamos o estado
        _db.Entry(service).State = EntityState.Modified;
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class UpdateBillingServiceEndpoints
{
    public static void MapUpdateBillingServiceEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/billing/services/{id:guid}", async (Guid id, UpdateBillingServiceCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
           .WithTags("Billing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Billing.Manage);
    }
}