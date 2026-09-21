using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

// 1. Request
public record ListCustomersQuery(string? Search, bool OnlyActive = true, int Page = 1, int PageSize = 20) : IRequest<IResult>;

// 2. Validator
public class ListCustomersQueryValidator : AbstractValidator<ListCustomersQuery>
{
    public ListCustomersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

// 3. Handler
public class ListCustomersHandler : IRequestHandler<ListCustomersQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListCustomersHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListCustomersQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.Customers.AsNoTracking().Where(c => c.CompanyId == companyId);

        if (request.OnlyActive) q = q.Where(c => c.IsActive);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            q = q.Where(c => EF.Functions.ILike(c.CorporateName, s) ||
                             EF.Functions.ILike(c.Cnpj, s) ||
                             (c.TradeName != null && EF.Functions.ILike(c.TradeName, s)));
        }

        // 1. Aguarda a contagem
        var totalCount = await q.CountAsync(ct);

        // 2. Aguarda os itens
        var items = await q
            .OrderBy(c => c.CorporateName)
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ProjectToType<CustomerDto>()
            .ToListAsync(ct);

        var response = new PaginatedResult<CustomerDto>(items, totalCount, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

// 4. Endpoint
public static class ListCustomersEndpoints
{
    public static void MapListCustomersEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/customers", async ([AsParameters] ListCustomersQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Customers")
           .RequireAuthorization()
           .RequirePermission(Permissions.Customers.View);
    }
}