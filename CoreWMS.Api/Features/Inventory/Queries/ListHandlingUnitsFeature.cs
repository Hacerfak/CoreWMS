using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ListHandlingUnitsQuery(Guid? CustomerId, Guid? ProductId, string? Lpn, Guid? LocationId, int? Status, int Page = 1, int PageSize = 20) : IRequest<IResult>;

public class ListHandlingUnitsQueryValidator : AbstractValidator<ListHandlingUnitsQuery>
{
    public ListHandlingUnitsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

public class ListHandlingUnitsHandler : IRequestHandler<ListHandlingUnitsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public ListHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(ListHandlingUnitsQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var q = _db.HandlingUnits.AsNoTracking()
            .Where(h => h.CompanyId == companyId);

        if (request.CustomerId.HasValue) q = q.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(h => h.ProductId == request.ProductId);
        if (request.LocationId.HasValue) q = q.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.Status.HasValue) q = q.Where(h => h.Status == (HuStatus)request.Status.Value);
        if (!string.IsNullOrWhiteSpace(request.Lpn)) q = q.Where(h => h.Lpn.Contains(request.Lpn.Trim().ToUpper()));

        var totalTask = q.CountAsync(ct);
        var skip = (request.Page - 1) * request.PageSize;

        var itemsTask = q
            .OrderByDescending(h => h.UpdatedAt ?? h.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(h => new HandlingUnitDto(
                h.Id, h.Lpn, h.Customer.CorporateName, h.Product.Sku, h.PackagingType.Code,
                h.CurrentLocationId, h.CurrentLocation != null ? h.CurrentLocation.FullPath : null,
                h.Batch, h.ManufactureDate, h.ExpirationDate, h.SerialNumber,
                h.InitialQuantity, h.CurrentQuantity, h.Status.ToString(), h.QualityStatus.ToString()
            )).ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<HandlingUnitDto>(itemsTask.Result, totalTask.Result, request.Page, request.PageSize);
        return Results.Ok(response);
    }
}

public static class ListHandlingUnitsEndpoints
{
    public static void MapListHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inventory/handling-units", async ([AsParameters] ListHandlingUnitsQuery query, IMediator mediator) =>
            await mediator.Send(query))
           .WithTags("Inventory")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.View);
    }
}