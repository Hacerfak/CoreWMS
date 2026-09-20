using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request
public record DeleteCompanyCommand(Guid Id) : IRequest<IResult>;

// 2. Handler
public class DeleteCompanyHandler : IRequestHandler<DeleteCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteCompanyCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        _db.Companies.Remove(company);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// 3. Endpoint
public static class DeleteCompanyEndpoints
{
    public static void MapDeleteCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/companies/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeleteCompanyCommand(id)))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}