using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing.Templates;

public record ListTemplatesQuery() : IRequest<IResult>;

public class ListTemplatesHandler : IRequestHandler<ListTemplatesQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListTemplatesHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListTemplatesQuery request, CancellationToken ct)
    {
        var templates = await _db.LabelTemplates.AsNoTracking().ToListAsync(ct);
        return Results.Ok(templates);
    }
}

public static class ListTemplatesEndpoints
{
    public static void MapListTemplatesEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/printing/templates", async (IMediator mediator) => await mediator.Send(new ListTemplatesQuery()))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}