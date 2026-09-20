using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Agents;

public record DeleteAgentCommand(Guid Id) : IRequest<IResult>;

public class DeleteAgentHandler : IRequestHandler<DeleteAgentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteAgentHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(DeleteAgentCommand request, CancellationToken ct)
    {
        var agent = await _db.PrintAgents.FindAsync(new object[] { request.Id }, ct);
        if (agent == null) return Results.NotFound();

        _db.PrintAgents.Remove(agent); // Exclusão em cascata cuidará das impressoras filhas
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class DeletePrintAgentEndpoints
{
    public static void MapDeletePrintAgentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/printing/agents/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteAgentCommand(id)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}