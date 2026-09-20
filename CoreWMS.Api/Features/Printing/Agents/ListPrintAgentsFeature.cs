using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing.Agents;

public record ListAgentsQuery() : IRequest<IResult>;

public class ListAgentsHandler : IRequestHandler<ListAgentsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPrintConnectionManager _connectionManager;

    public ListAgentsHandler(ApplicationDbContext db, IPrintConnectionManager connectionManager)
    {
        _db = db;
        _connectionManager = connectionManager;
    }

    public async Task<IResult> Handle(ListAgentsQuery request, CancellationToken ct)
    {
        var agents = await _db.PrintAgents.Include(a => a.Printers).AsNoTracking().ToListAsync(ct);

        var response = agents.Select(a => new PrintAgentResponseDto(
            a.Id, a.Name, a.ApiKey, a.IsActive,
            _connectionManager.IsOnline(a.ApiKey),
            a.Printers.Select(p => new PrinterResponseDto(p.Id, p.Name, p.Target, p.IsActive)).ToList()
        )).ToList();

        return Results.Ok(response);
    }
}

public static class ListPrintAgentsEndpoints
{
    public static void MapListPrintAgentsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/printing/agents", async (IMediator mediator) => await mediator.Send(new ListAgentsQuery()))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}