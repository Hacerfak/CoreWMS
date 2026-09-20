using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;

namespace CoreWMS.Api.Features.Printing.Printers;

public record UpdatePrinterRequest(string Name, string Target);
public record UpdatePrinterCommand(Guid Id, string Name, string Target) : IRequest<IResult>;

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

public static class UpdatePrinterEndpoints
{
    public static void MapUpdatePrinterEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/printing/printers/{id:guid}", async (Guid id, UpdatePrinterRequest req, IMediator mediator) =>
            await mediator.Send(new UpdatePrinterCommand(id, req.Name, req.Target)))
           .WithTags("Printing")
           .RequireAuthorization()
           .RequirePermission(Permissions.Printing.Manage);
    }
}