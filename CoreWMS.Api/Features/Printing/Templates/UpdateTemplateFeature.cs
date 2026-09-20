using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Templates;

public record UpdateTemplateRequest(string Name, string ZplContent, int WidthMm, int HeightMm);
public record UpdateTemplateCommand(Guid Id, string Name, string ZplContent, int WidthMm, int HeightMm) : IRequest<IResult>;

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

public static class UpdateTemplateEndpoints
{
    public static void MapUpdateTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/printing/templates/{id:guid}", async (Guid id, UpdateTemplateRequest req, IMediator mediator) =>
            await mediator.Send(new UpdateTemplateCommand(id, req.Name, req.ZplContent, req.WidthMm, req.HeightMm)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}