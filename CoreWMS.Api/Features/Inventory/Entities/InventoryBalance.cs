using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Inventory.Enums;
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
    public decimal TotalExpected { get; private set; }   // ASN / NF-e em trânsito
    public decimal TotalDock { get; private set; }       // Descarregado na Doca (Aguardando Alocação / Putaway)
    public decimal TotalAvailable { get; private set; }  // Armazenado no Estoque, Livre para Uso
    public decimal TotalAllocated { get; private set; }  // Empenhado/Reservado para Pedidos
    public decimal TotalQuarantine { get; private set; } // Armazenado em Posição de Qualidade / Bloqueado

    // Saldo Físico Real (Tudo o que está fisicamente dentro do prédio)
    public decimal TotalPhysical => TotalDock + TotalAvailable + TotalAllocated + TotalQuarantine;

    public Guid Version { get; private set; } = FastGuid.NewPostgreSqlGuid();

    protected InventoryBalance() { }

    public InventoryBalance(Guid companyId, Guid customerId, Guid productId)
    {
        CompanyId = companyId;
        CustomerId = customerId;
        ProductId = productId;
    }

    public void AddExpected(decimal quantity)
    {
        TotalExpected += quantity;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    public void RemoveExpected(decimal quantity)
    {
        if (quantity <= 0) return;
        TotalExpected -= quantity;
        if (TotalExpected < 0) TotalExpected = 0;
        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    // 1. Recebimento Físico na Doca
    public void ReceiveToDock(decimal quantity)
    {
        if (quantity <= 0) return;

        if (TotalExpected >= quantity)
            TotalExpected -= quantity;
        else
            TotalExpected = 0;

        TotalDock += quantity;

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    // 2. Alocação (Putaway) da Doca para o Armazém ou Qualidade
    public void AllocateFromDock(decimal quantity, Topology.Enums.StorageRole destinationRole, QualityStatus qualityStatus)
    {
        if (quantity <= 0) return;

        if (TotalDock >= quantity)
            TotalDock -= quantity;
        else
            TotalDock = 0;

        if (destinationRole == Topology.Enums.StorageRole.Quality || qualityStatus != QualityStatus.Available)
        {
            TotalQuarantine += quantity;
        }
        else
        {
            TotalAvailable += quantity;
        }

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    // 3. Alteração de Qualidade em Item já Armazenado
    public void ChangeQualityForStored(decimal quantity, QualityStatus oldStatus, QualityStatus newStatus)
    {
        if (quantity <= 0 || oldStatus == newStatus) return;

        // De Disponível para Bloqueado/Quarentena
        if (oldStatus == QualityStatus.Available && newStatus != QualityStatus.Available)
        {
            if (TotalAvailable >= quantity) TotalAvailable -= quantity;
            TotalQuarantine += quantity;
        }
        // De Bloqueado/Quarentena para Disponível
        else if (oldStatus != QualityStatus.Available && newStatus == QualityStatus.Available)
        {
            if (TotalQuarantine >= quantity) TotalQuarantine -= quantity;
            TotalAvailable += quantity;
        }

        UpdatedAt = DateTime.UtcNow;
        Version = FastGuid.NewPostgreSqlGuid();
    }

    // 4. Estorno de Recebimento
    public void RollbackReceipt(decimal quantity, HuStatus huStatus, QualityStatus qualityStatus)
    {
        if (quantity <= 0) return;

        TotalExpected += quantity;

        if (huStatus == HuStatus.Received)
        {
            TotalDock -= quantity;
            if (TotalDock < 0) TotalDock = 0;
        }
        else if (qualityStatus == QualityStatus.Available)
        {
            TotalAvailable -= quantity;
            if (TotalAvailable < 0) TotalAvailable = 0;
        }
        else
        {
            TotalQuarantine -= quantity;
            if (TotalQuarantine < 0) TotalQuarantine = 0;
        }

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