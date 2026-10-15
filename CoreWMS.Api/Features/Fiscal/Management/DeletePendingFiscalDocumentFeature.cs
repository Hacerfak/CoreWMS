using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Management;

public record DeletePendingFiscalDocumentCommand(Guid Id) : IRequest<IResult>;

public class DeletePendingFiscalDocumentCommandValidator : AbstractValidator<DeletePendingFiscalDocumentCommand>
{
    public DeletePendingFiscalDocumentCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty().WithMessage("O identificador do documento é obrigatório.");
    }
}

public class DeletePendingFiscalDocumentHandler : IRequestHandler<DeletePendingFiscalDocumentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeletePendingFiscalDocumentHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeletePendingFiscalDocumentCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var doc = await _db.CompanyFiscalDocuments
            .FirstOrDefaultAsync(d => d.Id == request.Id && d.CompanyId == companyId, ct);

        if (doc == null)
            return Results.NotFound(new { Message = "Documento fiscal não encontrado." });

        if (doc.Status != FiscalDocumentStatus.Pending)
        {
            return Results.BadRequest(new { Message = "Apenas notas fiscais em situação 'Pendente' podem ser excluídas." });
        }

        _db.CompanyFiscalDocuments.Remove(doc);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { Message = "Nota fiscal pendente excluída com sucesso! Uma nova nota pode ser gerada." });
    }
}

public static class DeletePendingFiscalDocumentEndpoints
{
    public static void MapDeletePendingFiscalDocumentEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/fiscal/documents/{id:guid}", async (Guid id, IMediator mediator) =>
            await mediator.Send(new DeletePendingFiscalDocumentCommand(id)))
            .WithTags("Fiscal")
            .RequireAuthorization()
            .RequirePermission(Permissions.Outbound.Manage);
    }
}