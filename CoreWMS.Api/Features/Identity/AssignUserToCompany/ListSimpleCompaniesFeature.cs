using CoreWMS.Api.Infrastructure.Data;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request / Response
public record ListSimpleCompaniesQuery() : IRequest<IResult>;
public record SimpleCompanyDto(Guid Id, string Cnpj, string CorporateName);

// 2. Handler
public class ListSimpleCompaniesHandler : IRequestHandler<ListSimpleCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;

    public ListSimpleCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListSimpleCompaniesQuery request, CancellationToken ct)
    {
        var companies = await _db.Companies
            .AsNoTracking()
            .Select(c => new SimpleCompanyDto(c.Id, c.Cnpj, c.CorporateName))
            .ToListAsync(ct);

        return Results.Ok(companies);
    }
}

// 3. Endpoint
public static class ListSimpleCompaniesEndpoints
{
    public static void MapListSimpleCompaniesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies-list", async (IMediator mediator) =>
            await mediator.Send(new ListSimpleCompaniesQuery()))
        .WithTags("Companies")
        .RequireAuthorization();
    }
}