using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Inbound.Enums;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound;

// ==========================================
// 1. COMMAND
// ==========================================
public record ImportInboundXmlCommand(List<string> XmlFiles) : IRequest<IResult>;

public class ImportInboundXmlCommandValidator : AbstractValidator<ImportInboundXmlCommand>
{
    public ImportInboundXmlCommandValidator()
    {
        RuleFor(x => x.XmlFiles).NotEmpty().WithMessage("Nenhum arquivo XML fornecido.");
    }
}

// ==========================================
// 2. HANDLER
// ==========================================
public class ImportInboundXmlHandler : IRequestHandler<ImportInboundXmlCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly INfeParserService _parser;

    public ImportInboundXmlHandler(ApplicationDbContext db, ITenantProvider tenant, INfeParserService parser)
    {
        _db = db;
        _tenant = tenant;
        _parser = parser;
    }

    public async Task<IResult> Handle(ImportInboundXmlCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // 1. Carrega os dados da Empresa Logística (Destinatário esperado)
        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null) return Results.BadRequest(new { Message = "Empresa não encontrada." });

        var processedOrders = new List<Guid>();
        var errors = new List<string>();

        // Carrega clientes e produtos existentes na memória para evitar N+1 queries no loop
        var existingCustomers = await _db.Customers.Where(c => c.CompanyId == companyId).ToListAsync(ct);
        var existingProducts = await _db.Products
            .AsNoTracking()
            .Where(p => p.CompanyId == companyId)
            .Select(p => new { p.Id, p.CustomerId, p.Sku, p.BaseBarcode })
            .ToListAsync(ct);

        foreach (var xmlString in request.XmlFiles)
        {
            try
            {
                // 2. Chama o Parser Universal
                var parsedNfe = _parser.ParseXml(xmlString);

                // 3. Validação: O Destinatário do XML é o nosso Armazém?
                if (parsedNfe.DestCnpj != company.Cnpj)
                {
                    errors.Add($"NF-e {parsedNfe.AccessKey}: O CNPJ destinatário ({parsedNfe.DestCnpj}) não pertence a esta empresa ({company.Cnpj}).");
                    continue;
                }

                // Proteção contra importação duplicada
                if (await _db.InboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct))
                {
                    errors.Add($"NF-e {parsedNfe.AccessKey}: Já importada anteriormente.");
                    continue;
                }

                // 4. Regra de Negócio: Cliente (Remetente)
                var customer = existingCustomers.FirstOrDefault(c => c.Cnpj == parsedNfe.IssuerCnpj);
                if (customer == null)
                {
                    // Gera o cadastro automático do cliente usando defaults logísticos seguros
                    customer = new Customer(
                        companyId, parsedNfe.IssuerCnpj, parsedNfe.IssuerName, null, null, 9, null, 1, null,
                        null, null, null, null, 0, null, "RS", null, null, null,
                        false, false, false, false, false, false, false, false,
                        PickingStrategy.Fifo, PickingBaseDate.ReceiptDate,
                        null, null, null, null, false, false, false
                    );
                    _db.Customers.Add(customer);
                    existingCustomers.Add(customer); // Adiciona na lista local para reaproveitar na mesma requisição
                }

                // 5. Criação da Ordem
                var order = new InboundOrder(
                    companyId, customer.Id, parsedNfe.IssuerCnpj, parsedNfe.IssuerName,
                    parsedNfe.AccessKey, xmlString, parsedNfe.IssueDate
                );
                _db.InboundOrders.Add(order);

                // 6. Regra de Negócio: Produtos e Pré-cadastro
                foreach (var item in parsedNfe.Items)
                {
                    // Tenta achar pelo GTIN(EAN) ou pelo SkuCode(cProd)
                    var matchedProduct = existingProducts.FirstOrDefault(p =>
                        p.CustomerId == customer.Id &&
                        (
                            (!string.IsNullOrWhiteSpace(item.Barcode) && p.BaseBarcode == item.Barcode) ||
                            p.Sku == item.SkuCode
                        )
                    );

                    var orderItem = new InboundOrderItem(
                        order.Id, item.LineNumber, item.SkuCode, item.Barcode, item.Description, item.Ncm,
                        item.Quantity, item.UnitValue, item.Batch, item.ManufactureDate, item.ExpirationDate
                    );

                    if (matchedProduct != null)
                    {
                        // Produto conhecido -> Vincula e deixa pronto para receber
                        orderItem.LinkProduct(matchedProduct.Id);
                    }
                    // Se matchedProduct for null, o construtor já deixou como ProductId = null e Status = Pending_Review

                    _db.InboundOrderItems.Add(orderItem);
                }

                processedOrders.Add(order.Id);
            }
            catch (Exception ex)
            {
                errors.Add($"Falha ao processar arquivo: {ex.Message}");
            }
        }

        // 7. Salva tudo em uma única transação no banco de dados
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Processamento concluído. {processedOrders.Count} ordens importadas.",
            ImportedIds = processedOrders,
            Errors = errors
        });
    }
}

// ==========================================
// 3. ENDPOINTS
// ==========================================
public static class InboundEndpoints
{
    public static void MapInboundEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/inbound").WithTags("Inbound").RequireAuthorization();

        group.MapPost("/import", async (IFormFileCollection files, IMediator mediator) =>
        {
            if (files == null || files.Count == 0) return Results.BadRequest(new { Message = "Nenhum arquivo enviado." });

            var xmlList = new List<string>();
            foreach (var file in files)
            {
                using var reader = new StreamReader(file.OpenReadStream());
                xmlList.Add(await reader.ReadToEndAsync());
            }

            return await mediator.Send(new ImportInboundXmlCommand(xmlList));
        })
        .RequirePermission(Permissions.Inbound.Import) // Ajuste para a permissão real de Recebimento depois
        .DisableAntiforgery(); // Necessário para upload de arquivos em Minimal APIs
    }
}