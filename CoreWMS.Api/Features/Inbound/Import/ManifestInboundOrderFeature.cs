using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Import;

public record ManifestInboundOrderCommand(
    Guid InboundOrderId,
    int EventTypeCode, // 210200 (Confirmação), 210220 (Desconhecimento), 210240 (Não Realizada)
    string? Justification
) : IRequest<IResult>;

public class ManifestInboundOrderCommandValidator : AbstractValidator<ManifestInboundOrderCommand>
{
    public ManifestInboundOrderCommandValidator()
    {
        RuleFor(x => x.InboundOrderId).NotEmpty();
        RuleFor(x => x.EventTypeCode).Must(code => new[] { 210200, 210210, 210220, 210240 }.Contains(code))
            .WithMessage("Código de evento de manifestação inválido (Opções: 210200, 210220, 210240).");

        When(x => x.EventTypeCode == 210240, () =>
        {
            RuleFor(x => x.Justification)
                .NotEmpty().WithMessage("Justificativa é obrigatória para Operação Não Realizada.")
                .MinimumLength(15).WithMessage("A justificativa deve conter no mínimo 15 caracteres.");
        });
    }
}

public class ManifestInboundOrderHandler : IRequestHandler<ManifestInboundOrderCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly ISefazDistDFeService _sefazService;

    public ManifestInboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant, ISefazDistDFeService sefazService)
    {
        _db = db;
        _tenant = tenant;
        _sefazService = sefazService;
    }

    public async Task<IResult> Handle(ManifestInboundOrderCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var order = await _db.InboundOrders
            .FirstOrDefaultAsync(o => o.Id == request.InboundOrderId && o.CompanyId == companyId, ct);

        if (order == null)
            return Results.NotFound(new { Message = "Ordem de recebimento não encontrada." });

        if (string.IsNullOrWhiteSpace(order.AccessKey))
            return Results.BadRequest(new { Message = "Esta ordem de recebimento não possui uma chave de acesso de NF-e vinculada." });

        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null || company.CertificateBytes == null)
            return Results.BadRequest(new { Message = "Certificado Digital A1 da Empresa não está configurado." });

        var manifestResult = await _sefazService.EnviarManifestacaoAsync(
            company,
            order.AccessKey,
            request.EventTypeCode,
            request.Justification ?? "",
            TipoAmbiente.Producao,
            ct
        );

        if (!manifestResult.Sucesso)
        {
            return Results.BadRequest(new { Message = $"Erro SEFAZ: {manifestResult.Mensagem}" });
        }

        order.UpdateSefazManifestStatus(request.EventTypeCode, manifestResult.Protocolo, manifestResult.DataEvento);
        await _db.SaveChangesAsync(ct);

        string eventName = request.EventTypeCode switch
        {
            210200 => "Confirmação da Operação",
            210210 => "Ciência da Operação",
            210220 => "Desconhecimento da Operação",
            210240 => "Operação Não Realizada",
            _ => "Manifestação"
        };

        return Results.Ok(new
        {
            Event = eventName,
            Protocol = manifestResult.Protocolo,
            EventDate = manifestResult.DataEvento,
            Message = $"Manifestação '{eventName}' registrada na SEFAZ com sucesso!"
        });
    }
}

public static class ManifestInboundOrderEndpoints
{
    public static void MapManifestInboundOrderEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/{inboundOrderId:guid}/manifest", async (Guid inboundOrderId, ManifestInboundOrderCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { InboundOrderId = inboundOrderId }))
           .WithTags("Inbound")
           .RequireAuthorization()
           .RequirePermission(Permissions.Inbound.Import);
    }
}