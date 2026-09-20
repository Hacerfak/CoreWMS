using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Agents;

public record UpdateAgentRequest(string Name);
public record UpdateAgentCommand(Guid Id, string Name) : IRequest<IResult>;

public class UpdateAgentHandler : IRequestHandler<UpdateAgentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateAgentHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateAgentCommand request, CancellationToken ct)
    {
        var agent = await _db.PrintAgents.FindAsync(new object[] { request.Id }, ct);
        if (agent == null) return Results.NotFound();

        agent.Update(request.Name, agent.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

public static class UpdatePrintAgentEndpoints
{
    public static void MapUpdatePrintAgentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/printing/agents/{id:guid}", async (Guid id, UpdateAgentRequest req, IMediator mediator) =>
            await mediator.Send(new UpdateAgentCommand(id, req.Name)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}