using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Printers;

public record DeletePrinterCommand(Guid Id) : IRequest<IResult>;

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

public static class DeletePrinterEndpoints
{
    public static void MapDeletePrinterEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/printing/printers/{id:guid}", async (Guid id, IMediator mediator) => await mediator.Send(new DeletePrinterCommand(id)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}