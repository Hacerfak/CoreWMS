using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Products.Entities;
using SecurityDriven;

namespace CoreWMS.Api.Features.Inventory.Entities;

public class InventoryBalance : AuditableEntity
{
    public Guid CompanyId { get; private set; }
    public Company Company { get; private set; } = null!;
    public Guid CustomerId { get; private set; }
    public Customer Customer { get; private set; } = null!;
    public Guid ProductId { get; private set; }
    public Product Product { get; private set; } = null!;

    // Os "Baldes" de Saldo (Sempre na Unidade Base do Produto)
    public decimal TotalExpected { get; private set; }    // Na doca, recebendo ou em trânsito (ASN)
    public decimal TotalAvailable { get; private set; }   // Livre para venda / separação
    public decimal TotalAllocated { get; private set; }   // Reservado/Empenhado para pedidos em andamento
    public decimal TotalQuarantine { get; private set; }  // Bloqueado fisicamente ou logicamente pela Qualidade

    // Saldo Físico Real (Tudo que ocupa espaço no prédio)
    public decimal TotalPhysical => TotalAvailable + TotalAllocated + TotalQuarantine;
    public Guid Version { get; private set; } = FastGuid.NewPostgreSqlGuid();

    protected InventoryBalance() { }

    public InventoryBalance(Guid companyId, Guid customerId, Guid productId)
    {
        CompanyId = companyId; CustomerId = customerId; ProductId = productId;
    }

    // Ações de movimentação dos baldes
    public void AddExpected(decimal quantity)
    {
        TotalExpected += quantity;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void Receive(decimal quantity)
    {
        if (TotalExpected >= quantity) TotalExpected -= quantity;
        TotalAvailable += quantity;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void AllocateForPicking(decimal quantity)
    {
        if (quantity > TotalAvailable) throw new InvalidOperationException("Saldo disponível insuficiente.");
        TotalAvailable -= quantity;
        TotalAllocated += quantity;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void UnallocateForPicking(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("A quantidade a ser estornada deve ser maior que zero.");
        if (quantity > TotalAllocated) throw new InvalidOperationException("Tentativa de estornar quantidade maior que o saldo alocado atual.");

        TotalAllocated -= quantity;
        TotalAvailable += quantity;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void ShipAllocated(decimal quantity)
    {
        if (quantity > TotalAllocated) throw new InvalidOperationException("Tentativa de expedir acima do alocado.");
        TotalAllocated -= quantity;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void Quarantine(decimal quantity)
    {
        if (quantity > TotalAvailable)
            throw new InvalidOperationException("Saldo disponível insuficiente para quarentena.");

        TotalAvailable -= quantity;
        TotalQuarantine += quantity;
        UpdatedAt = DateTime.UtcNow;
    }

    public void ReleaseFromQuarantine(decimal quantity)
    {
        if (quantity > TotalQuarantine)
            throw new InvalidOperationException("Tentativa de liberar quantidade maior que o saldo em quarentena.");

        TotalQuarantine -= quantity;
        TotalAvailable += quantity;
        UpdatedAt = DateTime.UtcNow;
    }

    public void Ship(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("A quantidade deve ser maior que zero.");
        if (TotalAvailable < quantity) throw new InvalidOperationException("Saldo disponível insuficiente para esta operação.");

        TotalAvailable -= quantity;
        // O TotalPhysical não precisa ser alterado, ele se calcula sozinho!
        UpdatedAt = DateTime.UtcNow;
    }

    public void RemoveQuarantine(decimal quantity)
    {
        if (quantity <= 0) throw new ArgumentException("A quantidade deve ser maior que zero.");
        if (TotalQuarantine < quantity) throw new InvalidOperationException("Saldo bloqueado/virtual insuficiente para esta operação.");

        TotalQuarantine -= quantity;
        // O TotalPhysical não precisa ser alterado, ele se calcula sozinho!
        UpdatedAt = DateTime.UtcNow;
    }
}