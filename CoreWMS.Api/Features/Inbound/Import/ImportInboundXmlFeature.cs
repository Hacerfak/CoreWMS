using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using DFe.Classes.Flags;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Inbound.Import;

public record ImportInboundXmlCommand(List<string> XmlFiles) : IRequest<IResult>;

public class ImportInboundXmlCommandValidator : AbstractValidator<ImportInboundXmlCommand>
{
    public ImportInboundXmlCommandValidator()
    {
        RuleFor(x => x.XmlFiles).NotEmpty().WithMessage("Nenhum arquivo XML fornecido.");
    }
}

public class ImportInboundXmlHandler : IRequestHandler<ImportInboundXmlCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;
    private readonly INfeParserService _parser;
    private readonly ISefazDistDFeService _sefazService;

    public ImportInboundXmlHandler(
        ApplicationDbContext db,
        ITenantProvider tenant,
        INfeParserService parser,
        ISefazDistDFeService sefazService)
    {
        _db = db;
        _tenant = tenant;
        _parser = parser;
        _sefazService = sefazService;
    }

    public async Task<IResult> Handle(ImportInboundXmlCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var company = await _db.Companies.FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null) return Results.BadRequest(new { Message = "Empresa não encontrada." });

        var processedOrders = new List<Guid>();
        var errors = new List<string>();

        var existingCustomers = await _db.Customers.Where(c => c.CompanyId == companyId).ToListAsync(ct);
        var existingProducts = await _db.Products.AsNoTracking()
            .Where(p => p.CompanyId == companyId)
            .Select(p => new { p.Id, p.CustomerId, p.Sku, p.BaseBarcode })
            .ToListAsync(ct);

        // ====================================================================
        // OTIMIZAÇÃO: PROCESSAMENTO EM LOTES DE ATÉ 5 XMLS POR VEZ
        // ====================================================================
        const int BATCH_SIZE = 5;
        var xmlBatches = request.XmlFiles.Chunk(BATCH_SIZE);

        foreach (var xmlBatch in xmlBatches)
        {
            var batchOrdersToManifest = new List<(InboundOrder Order, string AccessKey)>();

            foreach (var xmlString in xmlBatch)
            {
                if (string.IsNullOrWhiteSpace(xmlString)) continue;

                try
                {
                    var parsedNfe = _parser.ParseXml(xmlString);
                    var issuer = parsedNfe.Issuer;

                    // 1. Validação do CNPJ Destinatário (Ajustado para o novo objeto Recipient)
                    if (parsedNfe.Recipient.CnpjCpf != company.Cnpj)
                    {
                        errors.Add($"NF-e {parsedNfe.AccessKey}: Ignorada. O CNPJ destinatário ({parsedNfe.Recipient.CnpjCpf}) não pertence a esta empresa ({company.Cnpj}).");
                        continue;
                    }

                    // 2. Validação de Duplicidade
                    if (await _db.InboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct))
                    {
                        errors.Add($"NF-e {parsedNfe.AccessKey}: Ignorada. Já foi importada anteriormente.");
                        continue;
                    }

                    var customer = existingCustomers.FirstOrDefault(c => c.Cnpj == issuer.Cnpj);

                    // 3. Cadastra ou Atualiza o Depositante
                    if (customer == null)
                    {
                        customer = new Customer(
                            companyId,
                            issuer.Cnpj,
                            issuer.CorporateName,
                            issuer.TradeName,
                            issuer.StateRegistration,
                            string.IsNullOrWhiteSpace(issuer.StateRegistration) ? 9 : 1,
                            issuer.MunicipalRegistration,
                            issuer.Crt ?? 1,
                            issuer.Cnae,
                            issuer.Street,
                            issuer.Number,
                            issuer.Complement,
                            issuer.Neighborhood,
                            issuer.CityCode ?? 0,
                            issuer.CityName,
                            string.IsNullOrWhiteSpace(issuer.State) ? "RS" : issuer.State,
                            issuer.ZipCode,
                            null,
                            issuer.Phone,
                            false, false, false, false, false, false, false, false,
                            PickingStrategy.Fifo, PickingBaseDate.ReceiptDate,
                            null, null, null, null, false, false, false
                        );

                        _db.Customers.Add(customer);
                        existingCustomers.Add(customer);
                    }
                    else
                    {
                        customer.UpdateFiscalDetails(
                            issuer.CorporateName,
                            issuer.TradeName,
                            issuer.StateRegistration,
                            issuer.MunicipalRegistration,
                            issuer.Crt,
                            issuer.Cnae,
                            issuer.Street,
                            issuer.Number,
                            issuer.Complement,
                            issuer.Neighborhood,
                            issuer.CityCode,
                            issuer.CityName,
                            issuer.State,
                            issuer.ZipCode,
                            issuer.Phone
                        );
                    }

                    // 4. Cria a Ordem de Recebimento
                    var order = new InboundOrder(
                        companyId,
                        customer.Id,
                        issuer.Cnpj,
                        issuer.CorporateName,
                        parsedNfe.AccessKey,
                        xmlString,
                        parsedNfe.IssueDate
                    );
                    _db.InboundOrders.Add(order);

                    // 5. Itens da Nota
                    foreach (var item in parsedNfe.Items)
                    {
                        var matchedProduct = existingProducts.FirstOrDefault(p =>
                            p.CustomerId == customer.Id &&
                            ((!string.IsNullOrWhiteSpace(item.Barcode) && p.BaseBarcode == item.Barcode) || p.Sku == item.SkuCode)
                        );

                        var orderItem = new InboundOrderItem(
                            order.Id, item.LineNumber, item.SkuCode, item.Barcode, item.Description,
                            item.Ncm, item.Cest, item.Unit,
                            item.Quantity, item.UnitValue, item.Batch, item.ManufactureDate, item.ExpirationDate
                        );

                        if (matchedProduct != null)
                        {
                            orderItem.LinkProduct(matchedProduct.Id);

                            var balance = await GetOrCreateBalanceAsync(companyId, customer.Id, matchedProduct.Id, ct);
                            balance.AddExpected(orderItem.ExpectedQuantity);
                        }

                        _db.InboundOrderItems.Add(orderItem);
                    }

                    processedOrders.Add(order.Id);
                    batchOrdersToManifest.Add((order, parsedNfe.AccessKey));
                }
                catch (Exception ex)
                {
                    errors.Add($"Falha ao processar arquivo XML: {ex.Message}");
                }
            }

            // Persiste no banco o lote atual de 5 ordens antes de ir para a SEFAZ
            await _db.SaveChangesAsync(ct);

            // 6. DISPARO PARALELO DAS CIÊNCIAS (210210) PARA O LOTE DE 5 NOTAS
            if (company.CertificateBytes != null && batchOrdersToManifest.Any())
            {
                var manifestTasks = batchOrdersToManifest.Select(async item =>
                {
                    try
                    {
                        var manifestResult = await _sefazService.EnviarManifestacaoAsync(
                            company,
                            item.AccessKey,
                            210210, // Ciência da Operação
                            justificativa: "",
                            ambiente: TipoAmbiente.Producao,
                            ct: ct
                        );

                        if (manifestResult.Sucesso)
                        {
                            item.Order.UpdateSefazManifestStatus(
                                210210,
                                manifestResult.Protocolo ?? "CIENCIA_AUTOMATICA_XML",
                                manifestResult.DataEvento ?? DateTime.UtcNow
                            );
                        }
                    }
                    catch
                    {
                        // Falhas na SEFAZ não travam o lançamento do WMS
                    }
                });

                await Task.WhenAll(manifestTasks);
                await _db.SaveChangesAsync(ct);
            }
        }

        return Results.Ok(new
        {
            Message = $"Processamento em lote concluído. {processedOrders.Count} ordem(ns) importada(s) com sucesso.",
            ProcessedCount = processedOrders.Count,
            IgnoredCount = errors.Count,
            ImportedIds = processedOrders,
            Errors = errors
        });
    }

    private async Task<InventoryBalance> GetOrCreateBalanceAsync(Guid companyId, Guid customerId, Guid productId, CancellationToken ct)
    {
        var balance = await _db.InventoryBalances
            .FirstOrDefaultAsync(b => b.CompanyId == companyId && b.CustomerId == customerId && b.ProductId == productId, ct);

        if (balance == null)
        {
            balance = new InventoryBalance(companyId, customerId, productId);
            _db.InventoryBalances.Add(balance);
        }
        return balance;
    }
}

public static class ImportInboundXmlEndpoints
{
    public static void MapImportInboundXmlEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/inbound/import", async (Microsoft.AspNetCore.Http.IFormFileCollection files, IMediator mediator) =>
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
        .WithTags("Inbound")
        .RequireAuthorization()
        .RequirePermission(Permissions.Inbound.Import)
        .DisableAntiforgery();
    }
}