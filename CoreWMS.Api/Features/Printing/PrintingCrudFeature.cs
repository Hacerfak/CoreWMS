using System.Security.Cryptography;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Printing;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Printing;

// 1. CONTRATOS & DTOs
public record CreateAgentCommand(string Name) : IRequest<IResult>;
public record CreatePrinterCommand(Guid PrintAgentId, string Name, string Target) : IRequest<IResult>;
public record CreateLabelTemplateCommand(string Name, string ZplContent, int WidthMm, int HeightMm) : IRequest<IResult>;

public record ListAgentsQuery() : IRequest<IResult>;
public record ListTemplatesQuery() : IRequest<IResult>;

public record UpdateAgentRequest(string Name);
public record UpdateAgentCommand(Guid Id, string Name) : IRequest<IResult>;

public record UpdatePrinterRequest(string Name, string Target);
public record UpdatePrinterCommand(Guid Id, string Name, string Target) : IRequest<IResult>;

// NOVO: Commands de Exclusão
public record DeleteAgentCommand(Guid Id) : IRequest<IResult>;
public record DeletePrinterCommand(Guid Id) : IRequest<IResult>;
public record DeleteTemplateCommand(Guid Id) : IRequest<IResult>;

public record PrinterResponseDto(Guid Id, string Name, string Target, bool IsActive);
public record PrintAgentResponseDto(Guid Id, string Name, string ApiKey, bool IsActive, bool IsOnline, List<PrinterResponseDto> Printers);

public record CreateTemplateRequest(string Name, string ZplContent, int WidthMm, int HeightMm);
public record CreateTemplateCommand(string Name, string ZplContent, int WidthMm, int HeightMm) : IRequest<IResult>;
public record UpdateTemplateRequest(string Name, string ZplContent, int WidthMm, int HeightMm);
public record UpdateTemplateCommand(Guid Id, string Name, string ZplContent, int WidthMm, int HeightMm) : IRequest<IResult>;
public record TemplateResponseDto(Guid Id, string Name, string ZplContent, int WidthMm, int HeightMm, bool IsActive);

// 2. VALIDADORES
public class CreateAgentCommandValidator : AbstractValidator<CreateAgentCommand>
{
    public CreateAgentCommandValidator() => RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
}

public class CreatePrinterCommandValidator : AbstractValidator<CreatePrinterCommand>
{
    public CreatePrinterCommandValidator()
    {
        RuleFor(x => x.PrintAgentId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Target).NotEmpty().MaximumLength(150);
    }
}

public class CreateTemplateCommandValidator : AbstractValidator<CreateTemplateCommand>
{
    public CreateTemplateCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome do template é obrigatório.").MinimumLength(3).MaximumLength(100);
        RuleFor(x => x.ZplContent).NotEmpty().WithMessage("O código ZPL é obrigatório.");
        RuleFor(x => x.WidthMm).GreaterThan(0);
        RuleFor(x => x.HeightMm).GreaterThan(0);
    }
}

public class UpdateTemplateCommandValidator : AbstractValidator<UpdateTemplateCommand>
{
    public UpdateTemplateCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("O ID do template é obrigatório.");
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome do template é obrigatório.").MinimumLength(3).MaximumLength(100);
        RuleFor(x => x.ZplContent).NotEmpty().WithMessage("O código ZPL é obrigatório.");
        RuleFor(x => x.WidthMm).GreaterThan(0);
        RuleFor(x => x.HeightMm).GreaterThan(0);
    }
}

// 3. HANDLERS
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
            _connectionManager.IsOnline(a.ApiKey), // Verifica no SignalR em tempo real!
            a.Printers.Select(p => new PrinterResponseDto(p.Id, p.Name, p.Target, p.IsActive)).ToList()
        )).ToList();

        return Results.Ok(response);
    }
}

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

public class UpdatePrinterHandler : IRequestHandler<UpdatePrinterCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdatePrinterHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdatePrinterCommand request, CancellationToken ct)
    {
        var printer = await _db.Printers.FindAsync(new object[] { request.Id }, ct);
        if (printer == null) return Results.NotFound();

        printer.Update(request.Name, request.Target, printer.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
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

        return Results.Created($"/api/printing/printers/{printer.Id}", printer.Adapt<PrinterResponseDto>());
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

public class CreateTemplateHandler : IRequestHandler<CreateTemplateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public CreateTemplateHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(CreateTemplateCommand request, CancellationToken ct)
    {
        var template = new LabelTemplate(request.Name, request.ZplContent, request.WidthMm, request.HeightMm);
        _db.LabelTemplates.Add(template);
        await _db.SaveChangesAsync(ct);

        return Results.Created($"/api/printing/templates/{template.Id}", template.Id);
    }
}

public class UpdateTemplateHandler : IRequestHandler<UpdateTemplateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateTemplateHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateTemplateCommand request, CancellationToken ct)
    {
        var template = await _db.LabelTemplates.FindAsync(new object[] { request.Id }, ct);
        if (template == null) return Results.NotFound();

        template.Update(request.Name, request.ZplContent, request.WidthMm, request.HeightMm, template.IsActive);
        await _db.SaveChangesAsync(ct);

        return Results.NoContent();
    }
}

// NOVO: Handlers de Exclusão
public class DeleteAgentHandler : IRequestHandler<DeleteAgentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteAgentHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> Handle(DeleteAgentCommand request, CancellationToken ct)
    {
        var agent = await _db.PrintAgents.FindAsync(new object[] { request.Id }, ct);
        if (agent == null) return Results.NotFound();
        _db.PrintAgents.Remove(agent); // Deleção em cascata apagará as impressoras filhas (EF Core)
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class DeletePrinterHandler : IRequestHandler<DeletePrinterCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeletePrinterHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> Handle(DeletePrinterCommand request, CancellationToken ct)
    {
        var printer = await _db.Printers.FindAsync(new object[] { request.Id }, ct);
        if (printer == null) return Results.NotFound();
        _db.Printers.Remove(printer);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public class DeleteTemplateHandler : IRequestHandler<DeleteTemplateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public DeleteTemplateHandler(ApplicationDbContext db) => _db = db;
    public async Task<IResult> Handle(DeleteTemplateCommand request, CancellationToken ct)
    {
        var template = await _db.LabelTemplates.FindAsync(new object[] { request.Id }, ct);
        if (template == null) return Results.NotFound();
        _db.LabelTemplates.Remove(template);
        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

// 4. ENDPOINTS
public static class PrintingCrudEndpoints
{
    public static void MapPrintingCrudEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/printing").WithTags("Printing").RequireAuthorization();

        // Agentes
        group.MapPost("/agents", async (CreateAgentCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Printing.Manage);
        group.MapGet("/agents", async (IMediator mediator) => await mediator.Send(new ListAgentsQuery())).RequirePermission(Permissions.Printing.Manage);
        group.MapPut("/agents/{id:guid}", async (Guid id, UpdateAgentRequest req, IMediator mediator) => await mediator.Send(new UpdateAgentCommand(id, req.Name))).RequirePermission(Permissions.Printing.Manage);
        group.MapDelete("/agents/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteAgentCommand(id))).RequirePermission(Permissions.Printing.Manage); // Novo

        // Impressoras
        group.MapPost("/printers", async (CreatePrinterCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Printing.Manage);
        group.MapPut("/printers/{id:guid}", async (Guid id, UpdatePrinterRequest req, IMediator mediator) => await mediator.Send(new UpdatePrinterCommand(id, req.Name, req.Target))).RequirePermission(Permissions.Printing.Manage);
        group.MapDelete("/printers/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeletePrinterCommand(id))).RequirePermission(Permissions.Printing.Manage); // Novo

        // Templates
        group.MapPost("/templates", async (CreateTemplateRequest req, IMediator mediator) => await mediator.Send(new CreateTemplateCommand(req.Name, req.ZplContent, req.WidthMm, req.HeightMm))).RequirePermission(Permissions.Printing.Manage);
        group.MapGet("/templates", async (IMediator mediator) => await mediator.Send(new ListTemplatesQuery())).RequirePermission(Permissions.Printing.Manage);
        group.MapPut("/templates/{id:guid}", async (Guid id, UpdateTemplateRequest req, IMediator mediator) => await mediator.Send(new UpdateTemplateCommand(id, req.Name, req.ZplContent, req.WidthMm, req.HeightMm))).RequirePermission(Permissions.Printing.Manage);
        group.MapDelete("/templates/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteTemplateCommand(id))).RequirePermission(Permissions.Printing.Manage); // Novo
    }
}