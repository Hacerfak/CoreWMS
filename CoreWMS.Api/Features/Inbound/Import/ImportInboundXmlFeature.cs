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
            .Select(p => new { p.Id, p.CustomerId, p.Sku, p.BaseBarcode, p.NetWeight, p.GrossWeight })
            .ToListAsync(ct);

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

                    // 1. Validação do CNPJ Destinatário
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

                    var totalQtdGeralNota = parsedNfe.Items.Sum(i => i.Quantity);
                    var nfeTotalPesoL = parsedNfe.TotalNetWeight ?? 0m;
                    var nfeTotalPesoB = parsedNfe.TotalGrossWeight ?? 0m;

                    // 5. Itens da Nota com Fallback Direto do Parser
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

                        // 1º Tenta calcular via peso total da nota (se informado na tag <vol>)
                        decimal calculatedNet = 0m;
                        decimal calculatedGross = 0m;

                        if (totalQtdGeralNota > 0 && nfeTotalPesoL > 0)
                            calculatedNet = Math.Round(nfeTotalPesoL / totalQtdGeralNota, 4);

                        if (totalQtdGeralNota > 0 && nfeTotalPesoB > 0)
                            calculatedGross = Math.Round(nfeTotalPesoB / totalQtdGeralNota, 4);

                        // 2º Fallback para o cadastro do produto
                        decimal finalUnitNet = calculatedNet > 0 ? calculatedNet : (matchedProduct?.NetWeight ?? 0m);
                        decimal finalUnitGross = calculatedGross > 0 ? calculatedGross : (matchedProduct?.GrossWeight ?? 0m);

                        if (finalUnitGross <= 0m) finalUnitGross = finalUnitNet;

                        orderItem.SetUnitWeights(finalUnitNet, finalUnitGross);

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

            // Persiste as ordens importadas antes de disparar o evento SEFAZ
            await _db.SaveChangesAsync(ct);

            // 6. DISPARO DO EVENTO DE CIÊNCIA DA OPERAÇÃO (210210) PARA O XML IMPORTADO
            if (company.CertificateBytes != null && company.CertificateBytes.Length > 0 && batchOrdersToManifest.Any())
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
                        // Falhas de rede ou SEFAZ não impedem a persistência da ordem no WMS
                    }
                });

                await Task.WhenAll(manifestTasks);
                await _db.SaveChangesAsync(ct);
            }
        }

        return Results.Ok(new
        {
            Message = $"Processamento concluído. {processedOrders.Count} ordem(ns) importada(s) e ciência registrada.",
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