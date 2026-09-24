using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Identity.Companies;

public record ToggleCompanyActiveCommand(Guid Id) : IRequest<IResult>;

public class ToggleCompanyActiveHandler : IRequestHandler<ToggleCompanyActiveCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public ToggleCompanyActiveHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ToggleCompanyActiveCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        company.ToggleActive();
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { company.IsActive, Message = company.IsActive ? "Empresa ativada com sucesso." : "Empresa inativada com sucesso." });
    }
}

public static class ToggleCompanyActiveEndpoints
{
    public static void MapToggleCompanyActiveEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPatch("/api/companies/{id:guid}/toggle-active", async (Guid id, IMediator mediator) =>
            await mediator.Send(new ToggleCompanyActiveCommand(id)))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}