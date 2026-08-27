using System.Security.Cryptography;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing;

// DTOs
public record CreateAgentCommand(string Name) : IRequest<IResult>;
public record CreatePrinterCommand(Guid PrintAgentId, string Name, string Target) : IRequest<IResult>;
public record CreateLabelTemplateCommand(string Name, string ZplContent, int WidthMm, int HeightMm) : IRequest<IResult>;
public record ListAgentsQuery() : IRequest<IResult>;
public record ListTemplatesQuery() : IRequest<IResult>;

public record PrinterResponseDto(Guid Id, string Name, string Target, bool IsActive);
public record PrintAgentResponseDto(Guid Id, string Name, string ApiKey, bool IsActive, List<PrinterResponseDto> Printers);

// HANDLERS
public class CreateAgentHandler : IRequestHandler<CreateAgentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateAgentHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateAgentCommand request, CancellationToken ct)
    {
        if (await _db.PrintAgents.AnyAsync(a => a.Name == request.Name, ct)) return Results.BadRequest(new { Message = "Já existe um agente com este nome." });

        var keyBytes = RandomNumberGenerator.GetBytes(32);
        var apiKey = $"pagent_live_{Convert.ToBase64String(keyBytes).Replace("+", "").Replace("/", "").Replace("=", "")}";

        var agent = new PrintAgent(request.Name, apiKey);
        _db.PrintAgents.Add(agent);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/printing/agents/{agent.Id}", new { agent.Id, agent.Name, agent.ApiKey });
    }
}

public class ListAgentsHandler : IRequestHandler<ListAgentsQuery, IResult>
{
    private readonly ApplicationDbContext _db;
    public ListAgentsHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(ListAgentsQuery request, CancellationToken ct)
    {
        var agents = await _db.PrintAgents.AsNoTracking()
            .Select(a => new PrintAgentResponseDto(a.Id, a.Name, a.ApiKey, a.IsActive, a.Printers.Select(p => new PrinterResponseDto(p.Id, p.Name, p.Target, p.IsActive)).ToList()))
            .ToListAsync(ct);
        return Results.Ok(agents);
    }
}

public class CreatePrinterHandler : IRequestHandler<CreatePrinterCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreatePrinterHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreatePrinterCommand request, CancellationToken ct)
    {
        var agent = await _db.PrintAgents.FindAsync(new object[] { request.PrintAgentId }, ct);
        if (agent == null) return Results.NotFound(new { Message = "Agente de Impressão não encontrado." });

        var printer = new Printer(request.PrintAgentId, request.Name, request.Target);
        _db.Printers.Add(printer);
        await _db.SaveChangesAsync(ct);
        return Results.Created($"/api/printing/printers/{printer.Id}", new { printer.Id, printer.Name, printer.Target });
    }
}

public class CreateLabelTemplateHandler : IRequestHandler<CreateLabelTemplateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateLabelTemplateHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateLabelTemplateCommand request, CancellationToken ct)
    {
        var template = new LabelTemplate(request.Name, request.ZplContent, request.WidthMm, request.HeightMm);
        _db.LabelTemplates.Add(template);
        await _db.SaveChangesAsync(ct);
        return Results.Created($"/api/printing/templates/{template.Id}", new { template.Id, template.Name });
    }
}

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

// ENDPOINTS
public static class PrintingCrudEndpoints
{
    public static void MapPrintingCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/printing").WithTags("Printing").RequireAuthorization();

        group.MapPost("/agents", async (CreateAgentCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Printing.Manage);
        group.MapGet("/agents", async (IMediator mediator) => await mediator.Send(new ListAgentsQuery())).RequirePermission(Permissions.Printing.Manage);

        group.MapPost("/printers", async (CreatePrinterCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Printing.Manage);

        group.MapPost("/templates", async (CreateLabelTemplateCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Printing.Manage);
        group.MapGet("/templates", async (IMediator mediator) => await mediator.Send(new ListTemplatesQuery())).RequirePermission(Permissions.Printing.Manage);
    }
}