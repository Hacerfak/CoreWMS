using System.Security.Cryptography;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing.Agents;

// 1. Request
public record CreateAgentCommand(string Name) : IRequest<IResult>;

// 2. Validator
public class CreateAgentCommandValidator : AbstractValidator<CreateAgentCommand>
{
    public CreateAgentCommandValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
}

// 3. Handler
public class CreateAgentHandler : IRequestHandler<CreateAgentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateAgentHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateAgentCommand request, CancellationToken ct)
    {
        if (await _db.PrintAgents.AnyAsync(a => a.Name == request.Name, ct))
            return Results.BadRequest(new { Message = "Já existe um agente com este nome." });

        var keyBytes = RandomNumberGenerator.GetBytes(32);
        var apiKey = $"pagent_live_{Convert.ToBase64String(keyBytes).Replace("+", "").Replace("/", "").Replace("=", "")}";

        var agent = new PrintAgent(request.Name, apiKey);

        _db.PrintAgents.Add(agent);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/printing/agents/{agent.Id}", new { agent.Id, agent.Name, agent.ApiKey });
    }
}

// 4. Endpoint
public static class CreatePrintAgentEndpoints
{
    public static void MapCreatePrintAgentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/printing/agents", async (CreateAgentCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}