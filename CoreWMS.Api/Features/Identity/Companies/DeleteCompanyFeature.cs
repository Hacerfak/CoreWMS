using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

public record DeleteCompanyCommand(Guid Id) : IRequest<IResult>;

public class DeleteCompanyHandler : IRequestHandler<DeleteCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteCompanyCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        // Proteção contra FK: Verifica a tabela associativa N:N (UserCompanies) e Clientes
        var hasUsers = await _db.UserCompanyRoles.AnyAsync(uc => uc.CompanyId == request.Id, ct);
        var hasCustomers = await _db.Customers.AnyAsync(c => c.CompanyId == request.Id, ct);

        if (hasUsers || hasCustomers)
        {
            return Results.BadRequest(new { Message = "Esta empresa possui usuários ou clientes vinculados. Em vez de excluir, utilize a opção de inativação." });
        }

        _db.Companies.Remove(company);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

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