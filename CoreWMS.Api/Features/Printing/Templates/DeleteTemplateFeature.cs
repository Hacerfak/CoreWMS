using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Templates;

public record DeleteTemplateCommand(Guid Id) : IRequest<IResult>;

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

public static class DeleteTemplateEndpoints
{
    public static void MapDeleteTemplateEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/printing/templates/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeleteTemplateCommand(id)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}