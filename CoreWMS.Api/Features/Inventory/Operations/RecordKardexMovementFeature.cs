using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using FluentValidation;
using MediatR;
using Microsoft.AspNetCore.Http;

namespace CoreWMS.Api.Features.Inventory.Operations;

// DTO para envio de movimentação
public record RecordKardexMovementItemDto(
    Guid CustomerId,
    Guid ProductId,
    Guid? HandlingUnitId,
    Guid? LocationId,
    TransactionType Type,
    decimal QuantityChange,
    decimal BalanceAfter,
    Guid? SourceDocumentId = null,
    string? SourceDocumentNumber = null,
    Guid? CompanyId = null
);

// Comando Individual
public record RecordKardexMovementCommand(
    Guid CustomerId,
    Guid ProductId,
    Guid? HandlingUnitId,
    Guid? LocationId,
    TransactionType Type,
    decimal QuantityChange,
    decimal BalanceAfter,
    Guid? SourceDocumentId = null,
    string? SourceDocumentNumber = null,
    Guid? CompanyId = null
) : IRequest<IResult>;

// Comando em Lote (Batch) para Recebimentos e Expedições com múltiplas HUs
public record RecordBatchKardexMovementsCommand(
    List<RecordKardexMovementItemDto> Movements
) : IRequest<IResult>;

public class RecordKardexMovementCommandValidator : AbstractValidator<RecordKardexMovementCommand>
{
    public RecordKardexMovementCommandValidator()
    {
        RuleFor(x => x.CustomerId).NotEmpty().WithMessage("Depositante obrigatório.");
        RuleFor(x => x.ProductId).NotEmpty().WithMessage("Produto obrigatório.");
        RuleFor(x => x.Type).IsInEnum().WithMessage("Tipo de movimentação inválido.");
        RuleFor(x => x.BalanceAfter)
            .GreaterThanOrEqualTo(0)
            .WithMessage("O saldo resultante no Kardex jamais pode ser negativo.");
    }
}

public class RecordBatchKardexMovementsCommandValidator : AbstractValidator<RecordBatchKardexMovementsCommand>
{
    public RecordBatchKardexMovementsCommandValidator()
    {
        RuleFor(x => x.Movements).NotEmpty().WithMessage("Informe ao menos um movimento para o Kardex.");
        RuleForEach(x => x.Movements).ChildRules(m =>
        {
            m.RuleFor(x => x.CustomerId).NotEmpty();
            m.RuleFor(x => x.ProductId).NotEmpty();
            m.RuleFor(x => x.BalanceAfter)
                .GreaterThanOrEqualTo(0)
                .WithMessage("O saldo resultante de cada movimentação deve ser maior ou igual a zero.");
        });
    }
}

public class RecordKardexMovementHandler :
    IRequestHandler<RecordKardexMovementCommand, IResult>,
    IRequestHandler<RecordBatchKardexMovementsCommand, IResult>
{
    private readonly KardexChannel _kardex;
    private readonly ITenantProvider _tenant;

    public RecordKardexMovementHandler(KardexChannel kardex, ITenantProvider tenant)
    {
        _kardex = kardex;
        _tenant = tenant;
    }

    public async Task<IResult> Handle(RecordKardexMovementCommand request, CancellationToken ct)
    {
        var companyId = request.CompanyId.HasValue && request.CompanyId.Value != Guid.Empty
            ? request.CompanyId.Value
            : _tenant.GetCompanyId();

        var balanceAfter = Math.Max(0m, request.BalanceAfter);

        var transaction = new InventoryTransaction(
            companyId,
            request.CustomerId,
            request.ProductId,
            request.HandlingUnitId,
            request.LocationId,
            request.Type,
            request.QuantityChange,
            balanceAfter,
            request.SourceDocumentId,
            request.SourceDocumentNumber
        );

        await _kardex.WriteAsync(transaction, ct);
        return Results.Ok();
    }

    public async Task<IResult> Handle(RecordBatchKardexMovementsCommand request, CancellationToken ct)
    {
        var tenantCompanyId = _tenant.GetCompanyId();

        foreach (var item in request.Movements)
        {
            var companyId = item.CompanyId.HasValue && item.CompanyId.Value != Guid.Empty
                ? item.CompanyId.Value
                : tenantCompanyId;

            var balanceAfter = Math.Max(0m, item.BalanceAfter);

            var transaction = new InventoryTransaction(
                companyId,
                item.CustomerId,
                item.ProductId,
                item.HandlingUnitId,
                item.LocationId,
                item.Type,
                item.QuantityChange,
                balanceAfter,
                item.SourceDocumentId,
                item.SourceDocumentNumber
            );

            await _kardex.WriteAsync(transaction, ct);
        }

        return Results.Ok();
    }
}