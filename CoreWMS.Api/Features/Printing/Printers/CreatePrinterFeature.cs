using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Printers;

public record CreatePrinterCommand(Guid PrintAgentId, string Name, string Target) : IRequest<IResult>;

public class CreatePrinterCommandValidator : AbstractValidator<CreatePrinterCommand>
{
    public CreatePrinterCommandValidator()
    {
        RuleFor(x => x.PrintAgentId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Target).NotEmpty().MaximumLength(150);
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

public static class CreatePrinterEndpoints
{
    public static void MapCreatePrinterEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/printing/printers", async (CreatePrinterCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}