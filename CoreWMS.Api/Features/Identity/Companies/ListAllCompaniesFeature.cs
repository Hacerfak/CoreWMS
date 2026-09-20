using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request
public record ListAllCompaniesQuery() : IRequest<IResult>;

// 2. Handler
public class ListAllCompaniesHandler : IRequestHandler<ListAllCompaniesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListAllCompaniesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListAllCompaniesQuery request, CancellationToken ct)
    {
        var companies = await _db.Companies
            .AsNoTracking()
            .ProjectToType<CompanyDto>()
            .ToListAsync(ct);

        return Results.Ok(companies);
    }
}

// 3. Endpoint
public static class ListAllCompaniesEndpoints
{
    public static void MapListAllCompaniesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/companies", async (IMediator mediator) =>
            await mediator.Send(new ListAllCompaniesQuery()))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}