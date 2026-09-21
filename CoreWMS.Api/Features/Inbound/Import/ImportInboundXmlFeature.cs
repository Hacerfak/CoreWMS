using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Inbound.Entities;
using CoreWMS.Api.Features.Products.Enums;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Security;
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

    public ImportInboundXmlHandler(ApplicationDbContext db, ITenantProvider tenant, INfeParserService parser)
    {
        _db = db;
        _tenant = tenant;
        _parser = parser;
    }

    public async Task<IResult> Handle(ImportInboundXmlCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        var company = await _db.Companies.AsNoTracking().FirstOrDefaultAsync(c => c.Id == companyId, ct);
        if (company == null) return Results.BadRequest(new { Message = "Empresa não encontrada." });

        var processedOrders = new List<Guid>();
        var errors = new List<string>();

        var existingCustomers = await _db.Customers.Where(c => c.CompanyId == companyId).ToListAsync(ct);
        var existingProducts = await _db.Products.AsNoTracking()
            .Where(p => p.CompanyId == companyId)
            .Select(p => new { p.Id, p.CustomerId, p.Sku, p.BaseBarcode })
            .ToListAsync(ct);

        foreach (var xmlString in request.XmlFiles)
        {
            try
            {
                var parsedNfe = _parser.ParseXml(xmlString);

                if (parsedNfe.DestCnpj != company.Cnpj)
                {
                    errors.Add($"NF-e {parsedNfe.AccessKey}: O CNPJ destinatário ({parsedNfe.DestCnpj}) não pertence a esta empresa.");
                    continue;
                }

                if (await _db.InboundOrders.AnyAsync(o => o.CompanyId == companyId && o.AccessKey == parsedNfe.AccessKey, ct))
                {
                    errors.Add($"NF-e {parsedNfe.AccessKey}: Já importada anteriormente.");
                    continue;
                }

                var customer = existingCustomers.FirstOrDefault(c => c.Cnpj == parsedNfe.IssuerCnpj);
                if (customer == null)
                {
                    customer = new Customer(
                        companyId, parsedNfe.IssuerCnpj, parsedNfe.IssuerName, null, null, 9, null, 1, null,
                        null, null, null, null, 0, null, "RS", null, null, null,
                        false, false, false, false, false, false, false, false,
                        PickingStrategy.Fifo, PickingBaseDate.ReceiptDate,
                        null, null, null, null, false, false, false
                    );
                    _db.Customers.Add(customer);
                    existingCustomers.Add(customer);
                }

                var order = new InboundOrder(companyId, customer.Id, parsedNfe.IssuerCnpj, parsedNfe.IssuerName, parsedNfe.AccessKey, xmlString, parsedNfe.IssueDate);
                _db.InboundOrders.Add(order);

                foreach (var item in parsedNfe.Items)
                {
                    var matchedProduct = existingProducts.FirstOrDefault(p =>
                        p.CustomerId == customer.Id &&
                        ((!string.IsNullOrWhiteSpace(item.Barcode) && p.BaseBarcode == item.Barcode) || p.Sku == item.SkuCode)
                    );

                    var orderItem = new InboundOrderItem(
                        order.Id, item.LineNumber, item.SkuCode, item.Barcode, item.Description, item.Ncm,
                        item.Quantity, item.UnitValue, item.Batch, item.ManufactureDate, item.ExpirationDate
                    );

                    if (matchedProduct != null) orderItem.LinkProduct(matchedProduct.Id);

                    _db.InboundOrderItems.Add(orderItem);
                }

                processedOrders.Add(order.Id);
            }
            catch (Exception ex)
            {
                errors.Add($"Falha ao processar arquivo: {ex.Message}");
            }
        }

        await _db.SaveChangesAsync(ct);

        return Results.Ok(new
        {
            Message = $"Processamento concluído. {processedOrders.Count} ordens importadas.",
            ImportedIds = processedOrders,
            Errors = errors
        });
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