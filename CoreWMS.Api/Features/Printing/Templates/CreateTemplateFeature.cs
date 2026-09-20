using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Templates;

public record CreateTemplateRequest(string Name, string ZplContent, int WidthMm, int HeightMm);
public record CreateTemplateCommand(string Name, string ZplContent, int WidthMm, int HeightMm) : IRequest<IResult>;

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

public static class CreateTemplateEndpoints
{
    public static void MapCreateTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/printing/templates", async (CreateTemplateRequest req, IMediator mediator) =>
            await mediator.Send(new CreateTemplateCommand(req.Name, req.ZplContent, req.WidthMm, req.HeightMm)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}