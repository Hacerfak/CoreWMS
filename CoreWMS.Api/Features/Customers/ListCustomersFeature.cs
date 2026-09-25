using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Customers;

public record ListCustomersQuery(string? Search, bool? OnlyActive, string? Status, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListCustomersQueryValidator : AbstractValidator<ListCustomersQuery>
{
    public ListCustomersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000).WithMessage("O tamanho da página deve ser entre 1 e 1000.");
    }
}

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

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(c => allowedCustomerIds.Contains(c.Id));
        }

        // Filtro de Status (ACTIVE, INACTIVE ou ALL)
        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            if (request.Status.Equals("ACTIVE", StringComparison.OrdinalIgnoreCase)) q = q.Where(c => c.IsActive);
            else if (request.Status.Equals("INACTIVE", StringComparison.OrdinalIgnoreCase)) q = q.Where(c => !c.IsActive);
        }
        else if (request.OnlyActive.HasValue && request.OnlyActive.Value)
        {
            q = q.Where(c => c.IsActive);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = $"%{request.Search.Trim()}%";
            q = q.Where(c => EF.Functions.ILike(c.CorporateName, s) ||
                             EF.Functions.ILike(c.Cnpj, s) ||
                             (c.TradeName != null && EF.Functions.ILike(c.TradeName, s)));
        }

        var totalCount = await q.CountAsync(ct);
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