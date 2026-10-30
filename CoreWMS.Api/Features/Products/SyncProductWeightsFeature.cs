using System;
using System.Collections.Generic;
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
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Products;

public record ProductWeightSyncItemDto(
    Guid ProductId,
    decimal UnitNetWeight,
    decimal UnitGrossWeight
);

public record SyncProductWeightsCommand(
    List<ProductWeightSyncItemDto> Items
) : IRequest<IResult>;

public class SyncProductWeightsCommandValidator : AbstractValidator<SyncProductWeightsCommand>
{
    public SyncProductWeightsCommandValidator()
    {
        RuleFor(x => x.Items).NotEmpty().WithMessage("Nenhum produto informado para sincronização de pesos.");
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(i => i.ProductId).NotEmpty().WithMessage("ID do produto é obrigatório.");
            item.RuleFor(i => i.UnitNetWeight).GreaterThanOrEqualTo(0).WithMessage("O peso líquido unitário não pode ser negativo.");
            item.RuleFor(i => i.UnitGrossWeight).GreaterThanOrEqualTo(0).WithMessage("O peso bruto unitário não pode ser negativo.");
        });
    }
}

public class SyncProductWeightsHandler : IRequestHandler<SyncProductWeightsCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public SyncProductWeightsHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(SyncProductWeightsCommand request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();
        var productIds = request.Items.Select(x => x.ProductId).Distinct().ToList();

        // 1. Busca os produtos e suas embalagens vinculadas pertencentes à empresa
        var products = await _db.Products
            .Include(p => p.Packagings)
            .Where(p => p.CompanyId == companyId && productIds.Contains(p.Id))
            .ToListAsync(ct);

        if (!products.Any())
            return Results.NotFound(new { Message = "Nenhum produto encontrado para atualização de pesos." });

        int updatedCount = 0;

        foreach (var item in request.Items)
        {
            var product = products.FirstOrDefault(p => p.Id == item.ProductId);
            if (product == null) continue;

            // REGRA: Só atualiza se o valor atual no cadastro mestre for igual a zero ou não preenchido
            bool needsNetWeight = product.NetWeight <= 0;
            bool needsGrossWeight = product.GrossWeight <= 0;

            // Se ambos os pesos já estão devidamente preenchidos no cadastro, preserva intacto
            if (!needsNetWeight && !needsGrossWeight)
            {
                continue;
            }

            decimal validNet = item.UnitNetWeight > 0 ? item.UnitNetWeight : item.UnitGrossWeight;
            decimal validGross = item.UnitGrossWeight > 0 ? item.UnitGrossWeight : item.UnitNetWeight;

            if (validNet <= 0 && validGross <= 0) continue;

            // Aplica os novos pesos mantendo o valor existente se já estava configurado
            decimal targetNet = needsNetWeight ? validNet : product.NetWeight;
            decimal targetGross = needsGrossWeight ? validGross : product.GrossWeight;

            // 2. Atualiza a unidade base do produto
            product.UpdateWeights(targetNet, targetGross);

            // 3. Recalcula as embalagens vinculadas cujos pesos também estejam zerados
            foreach (var pack in product.Packagings)
            {
                if (pack.NetWeight <= 0 || pack.GrossWeight <= 0)
                {
                    pack.AutoCalculateWeightsFromProduct(targetNet, targetGross);
                }
            }

            updatedCount++;
        }

        if (updatedCount > 0)
        {
            await _db.SaveChangesAsync(ct);
        }

        return Results.Ok(new
        {
            Message = $"{updatedCount} produto(s) com cadastro zerado foram preenchidos e tiveram suas embalagens recalculadas.",
            UpdatedCount = updatedCount
        });
    }
}

public static class SyncProductWeightsEndpoints
{
    public static void MapSyncProductWeightsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/products/sync-weights", async (SyncProductWeightsCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd))
           .WithTags("Products")
           .RequireAuthorization()
           .RequirePermission(Permissions.Products.Edit);
    }
}