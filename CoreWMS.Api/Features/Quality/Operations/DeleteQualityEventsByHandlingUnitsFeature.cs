using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Quality.Operations;

public record DeleteQualityEventsByHandlingUnitsCommand(List<Guid> HandlingUnitIds) : IRequest<IResult>;

public class DeleteQualityEventsByHandlingUnitsCommandValidator : AbstractValidator<DeleteQualityEventsByHandlingUnitsCommand>
{
    public DeleteQualityEventsByHandlingUnitsCommandValidator()
    {
        RuleFor(x => x.HandlingUnitIds).NotEmpty().WithMessage("Informe ao menos uma HU.");
    }
}

public class DeleteQualityEventsByHandlingUnitsHandler : IRequestHandler<DeleteQualityEventsByHandlingUnitsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public DeleteQualityEventsByHandlingUnitsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(DeleteQualityEventsByHandlingUnitsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Localiza os eventos de qualidade atrelados às HUs informadas dentro do Tenant
        var events = await _db.QualityEvents
            .Include(q => q.Images)
            .Where(q => q.CompanyId == companyId && request.HandlingUnitIds.Contains(q.HandlingUnitId))
            .ToListAsync(ct);

        if (!events.Any())
        {
            return Results.Ok(new { Message = "Nenhum evento de qualidade pendente para as HUs informadas.", DeletedCount = 0 });
        }

        // 2. Limpeza física dos arquivos de imagem em disco
        foreach (var ev in events)
        {
            if (ev.Images != null)
            {
                foreach (var img in ev.Images)
                {
                    if (!string.IsNullOrWhiteSpace(img.FilePath) && File.Exists(img.FilePath))
                    {
                        try
                        {
                            File.Delete(img.FilePath);
                        }
                        catch
                        {
                            // Ignora caso o arquivo já tenha sido removido
                        }
                    }
                }
            }
        }

        // 3. Remove os prontuários de qualidade do banco
        _db.QualityEvents.RemoveRange(events);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"{events.Count} evento(s) de qualidade removido(s) com sucesso.",
            DeletedCount = events.Count
        });
    }
}

public static class DeleteQualityEventsByHandlingUnitsEndpoints
{
    public static void MapDeleteQualityEventsByHandlingUnitsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/quality/events/by-handling-units/delete", async ([FromBody] DeleteQualityEventsByHandlingUnitsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Quality")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inventory.ManageQuality);
    }
}