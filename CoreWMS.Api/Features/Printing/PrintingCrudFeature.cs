using System.Security.Cryptography;
using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing;

// DTOs de Envio (Commands)
public record CreateAgentCommand(string Name) : ICommand<IResult>;
public record CreatePrinterCommand(Guid PrintAgentId, string Name, string Target) : ICommand<IResult>;
public record CreateLabelTemplateCommand(string Name, string ZplContent, int WidthMm, int HeightMm) : ICommand<IResult>;

// DTOs de Resposta (Queries)
public record PrinterResponseDto(Guid Id, string Name, string Target, bool IsActive);
public record PrintAgentResponseDto(Guid Id, string Name, string ApiKey, bool IsActive, List<PrinterResponseDto> Printers);

// HANDLERS
public class CreateAgentHandler : ICommandHandler<CreateAgentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateAgentHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(CreateAgentCommand command, CancellationToken ct = default)
    {
        var exists = await _db.PrintAgents.AnyAsync(a => a.Name == command.Name, ct);
        if (exists) return Results.BadRequest(new { Message = "Já existe um agente com este nome." });

        var keyBytes = RandomNumberGenerator.GetBytes(32);
        var apiKey = $"pagent_live_{Convert.ToBase64String(keyBytes).Replace("+", "").Replace("/", "").Replace("=", "")}";

        var agent = new PrintAgent(command.Name, apiKey);
        _db.PrintAgents.Add(agent);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/printing/agents/{agent.Id}", new { agent.Id, agent.Name, agent.ApiKey });
    }
}

public class CreatePrinterHandler : ICommandHandler<CreatePrinterCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreatePrinterHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(CreatePrinterCommand command, CancellationToken ct = default)
    {
        var agent = await _db.PrintAgents.FindAsync(new object[] { command.PrintAgentId }, ct);
        if (agent == null) return Results.NotFound(new { Message = "Agente de Impressão não encontrado." });

        var printer = new Printer(command.PrintAgentId, command.Name, command.Target);
        _db.Printers.Add(printer);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/printing/printers/{printer.Id}", new { printer.Id, printer.Name, printer.Target });
    }
}

public class CreateLabelTemplateHandler : ICommandHandler<CreateLabelTemplateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateLabelTemplateHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> HandleAsync(CreateLabelTemplateCommand command, CancellationToken ct = default)
    {
        var template = new LabelTemplate(command.Name, command.ZplContent, command.WidthMm, command.HeightMm);
        _db.LabelTemplates.Add(template);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/printing/templates/{template.Id}", new { template.Id, template.Name });
    }
}

// ENDPOINTS
public static class PrintingCrudEndpoints
{
    public static void MapPrintingCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/printing").WithTags("Printing").RequireAuthorization();

        // Agentes
        group.MapPost("/agents", async (CreateAgentCommand cmd, ICommandHandler<CreateAgentCommand, IResult> h, CancellationToken ct) =>
            await h.HandleAsync(cmd, ct)).RequirePermission(Permissions.Printing.Manage);

        group.MapGet("/agents", async (ApplicationDbContext db) =>
        {
            var agents = await db.PrintAgents
                .AsNoTracking()
                .Select(a => new PrintAgentResponseDto(
                    a.Id,
                    a.Name,
                    a.ApiKey,
                    a.IsActive,
                    a.Printers.Select(p => new PrinterResponseDto(p.Id, p.Name, p.Target, p.IsActive)).ToList()
                ))
                .ToListAsync();

            return Results.Ok(agents);
        }).RequirePermission(Permissions.Printing.Manage);

        // Impressoras
        group.MapPost("/printers", async (CreatePrinterCommand cmd, ICommandHandler<CreatePrinterCommand, IResult> h, CancellationToken ct) =>
            await h.HandleAsync(cmd, ct)).RequirePermission(Permissions.Printing.Manage);

        // Etiquetas (Templates)
        group.MapPost("/templates", async (CreateLabelTemplateCommand cmd, ICommandHandler<CreateLabelTemplateCommand, IResult> h, CancellationToken ct) =>
            await h.HandleAsync(cmd, ct)).RequirePermission(Permissions.Printing.Manage);

        group.MapGet("/templates", async (ApplicationDbContext db) =>
            Results.Ok(await db.LabelTemplates.AsNoTracking().ToListAsync())).RequirePermission(Permissions.Printing.Manage);
    }
}