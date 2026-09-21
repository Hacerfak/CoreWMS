using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Management;

public record GetInboundOrderByIdQuery(Guid Id) : IRequest<IResult>;

public class GetInboundOrderByIdHandler : IRequestHandler<GetInboundOrderByIdQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public GetInboundOrderByIdHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(GetInboundOrderByIdQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .AsNoTracking()
            .Include(o => o.Customer)
            .Include(o => o.Items)
            .Where(o => o.CompanyId == companyId && o.Id == request.Id)
            .Select(o => new InboundOrderDetailsDto(
                o.Id, o.CustomerId, o.Customer != null ? o.Customer.CorporateName : null,
                o.IssuerCnpj, o.IssuerName, o.AccessKey, o.RawXml, o.IssueDate, o.Status.ToString(),
                o.Items.OrderBy(i => i.LineNumber).Select(i => new InboundOrderItemDto(
                    i.Id, i.ProductId, i.LineNumber, i.RawSkuCode, i.RawDescription,
                    i.ExpectedQuantity, i.ReceivedQuantity, i.Status.ToString(), i.LockedByUserId
                )).ToList()
            )).FirstOrDefaultAsync(ct);

        if (order == null) return Results.NotFound();
        return Results.Ok(order);
    }
}

public static class GetInboundOrderByIdEndpoints
{
    public static void MapGetInboundOrderByIdEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/inbound/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new GetInboundOrderByIdQuery(id)))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.View);
    }
}