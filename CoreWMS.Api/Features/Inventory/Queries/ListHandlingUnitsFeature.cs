using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inventory.Queries;

public record ListHandlingUnitsQuery(
    Guid? CustomerId,
    Guid? ProductId,
    Guid? ReceiptDocumentId,
    string? Lpn,
    Guid? LocationId,
    int? Status,
    int Page = 1,
    int PageSize = 20
) : IRequest<IResult>;

public class ListHandlingUnitsQueryValidator : AbstractValidator<ListHandlingUnitsQuery>
{
    public ListHandlingUnitsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 1000).WithMessage("O tamanho da página deve ser entre 1 e 1000.");
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

        // Viseira B2B
        if (_tenant.IsPartnerUser())
        {
            var allowedCustomerIds = _tenant.GetAllowedCustomerIds();
            q = q.Where(h => allowedCustomerIds.Contains(h.CustomerId));
        }

        if (request.CustomerId.HasValue) q = q.Where(h => h.CustomerId == request.CustomerId);
        if (request.ProductId.HasValue) q = q.Where(h => h.ProductId == request.ProductId);
        if (request.ReceiptDocumentId.HasValue) q = q.Where(h => h.ReceiptDocumentId == request.ReceiptDocumentId);
        if (request.LocationId.HasValue) q = q.Where(h => h.CurrentLocationId == request.LocationId);
        if (request.Status.HasValue) q = q.Where(h => h.Status == (HuStatus)request.Status.Value);
        if (!string.IsNullOrWhiteSpace(request.Lpn)) q = q.Where(h => h.Lpn.Contains(request.Lpn.Trim().ToUpper()));

        var totalCount = await q.CountAsync(ct);
        var skip = (request.Page - 1) * request.PageSize;
        var items = await q
            .OrderByDescending(h => h.UpdatedAt ?? h.CreatedAt)
            .Skip(skip)
            .Take(request.PageSize)
            .Select(h => new HandlingUnitDto(
                h.Id,
                h.Lpn,
                h.Customer.CorporateName,
                h.Product.Sku,
                h.Product.Description,
                h.Product.BaseUnit,
                h.PackagingType.Code,
                h.CurrentLocationId,
                h.CurrentLocation != null ? h.CurrentLocation.FullPath : null,
                h.Batch,
                h.ManufactureDate,
                h.ExpirationDate,
                h.SerialNumber,
                h.InitialQuantity,
                h.CurrentQuantity,
                h.Status.ToString(),
                h.QualityStatus.ToString(),
                h.ReceiptDocumentId
            )).ToListAsync(ct);

        var response = new PaginatedResult<HandlingUnitDto>(items, totalCount, request.Page, request.PageSize);
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