using System.Security.Claims;
using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Features.Inventory.Entities;
using CoreWMS.Api.Features.Quality.Entities;
using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Features.CycleCount.Entities;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Features.Printing.Entities;
using CoreWMS.Api.Features.Topology.Entities;
using CoreWMS.Api.Features.Products.Entities;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Data;

public class ApplicationDbContext : DbContext
{
    // Lista de propriedades globais ignoradas na auditoria (Sensíveis ou Efêmeras)
    private static readonly HashSet<string> IgnoredAuditProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "PasswordHash",
        "RefreshToken",
        "RefreshTokenExpiryTime",
        "CertificateBytes",
        "CertificatePassword"
    };
    private readonly AuditChannel _auditChannel;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        AuditChannel auditChannel,
        IHttpContextAccessor httpContextAccessor) : base(options)
    {
        _auditChannel = auditChannel;
        _httpContextAccessor = httpContextAccessor;
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Customer> Customers => Set<Customer>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserCompanyRole> UserCompanyRoles => Set<UserCompanyRole>();
    public DbSet<PrintAgent> PrintAgents => Set<PrintAgent>();
    public DbSet<Printer> Printers => Set<Printer>();
    public DbSet<LabelTemplate> LabelTemplates => Set<LabelTemplate>();
    public DbSet<StorageType> StorageTypes => Set<StorageType>();
    public DbSet<Warehouse> Warehouses => Set<Warehouse>();
    public DbSet<Zone> Zones => Set<Zone>();
    public DbSet<Location> Locations => Set<Location>();
    public DbSet<PackagingType> PackagingTypes => Set<PackagingType>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductPackaging> ProductPackagings => Set<ProductPackaging>();
    public DbSet<HandlingUnit> HandlingUnits => Set<HandlingUnit>();
    public DbSet<InventoryTransaction> InventoryTransactions => Set<InventoryTransaction>();
    public DbSet<InventoryBalance> InventoryBalances => Set<InventoryBalance>();
    public DbSet<QualityReason> QualityReasons => Set<QualityReason>();
    public DbSet<QualityEvent> QualityEvents => Set<QualityEvent>();
    public DbSet<QualityEventImage> QualityEventImages => Set<QualityEventImage>();
    public DbSet<BillingService> BillingServices => Set<BillingService>();
    public DbSet<CustomerTariff> CustomerTariffs => Set<CustomerTariff>();
    public DbSet<BillingCycle> BillingCycles => Set<BillingCycle>();
    public DbSet<BillingItem> BillingItems => Set<BillingItem>();
    public DbSet<CycleCountPlan> CycleCountPlans => Set<CycleCountPlan>();
    public DbSet<CycleCountTask> CycleCountTasks => Set<CycleCountTask>();
    public DbSet<CycleCountRecord> CycleCountRecords => Set<CycleCountRecord>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Mapeamentos e Restrições Originais Restauradas
        builder.Entity<User>(b =>
        {
            b.HasKey(u => u.Id);
            b.HasIndex(u => u.Email).IsUnique(); // Email não pode repetir
            b.Property(u => u.Name).IsRequired().HasMaxLength(150);
            b.Property(u => u.Email).IsRequired().HasMaxLength(150);
        });

        builder.Entity<Company>(b =>
        {
            b.HasKey(c => c.Id);
            b.HasIndex(c => c.Cnpj).IsUnique();
            b.Property(c => c.Cnpj).IsRequired().HasMaxLength(14);
            b.Property(c => c.CorporateName).IsRequired().HasMaxLength(150);
            b.Property(c => c.TradeName).HasMaxLength(150);
            b.Property(c => c.StateRegistration).HasMaxLength(20);
            b.Property(c => c.MunicipalRegistration).HasMaxLength(20);
            b.Property(c => c.State).IsRequired().HasMaxLength(2);

            // O EF Core mapeia byte[] como bytea no PostgreSQL por padrão
            b.Property(c => c.CertificateBytes);
            b.Property(c => c.CertificatePassword).HasMaxLength(100);
        });

        builder.Entity<Customer>(b =>
        {
            b.HasKey(c => c.Id);
            b.HasIndex(c => new { c.CompanyId, c.Cnpj }).IsUnique(); // Unicidade por Empresa + CNPJ
            b.Property(c => c.Cnpj).IsRequired().HasMaxLength(14);
            b.Property(c => c.CorporateName).IsRequired().HasMaxLength(150);
            b.Property(c => c.TradeName).HasMaxLength(150);
            b.Property(c => c.StateRegistration).HasMaxLength(20);
            b.Property(c => c.MunicipalRegistration).HasMaxLength(20);
            b.Property(c => c.State).IsRequired().HasMaxLength(2);

            // Chave estrangeira explícita restritiva para a Empresa
            b.HasOne(c => c.Company)
             .WithMany()
             .HasForeignKey(c => c.CompanyId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<Role>(b =>
        {
            b.HasKey(r => r.Id);
            b.Property(r => r.Name).IsRequired().HasMaxLength(100);
        });

        builder.Entity<RolePermission>(b =>
        {
            b.HasKey(rp => rp.Id);
            b.Property(rp => rp.Permission).IsRequired().HasMaxLength(100);
            b.HasIndex(rp => new { rp.RoleId, rp.Permission }).IsUnique();

            b.HasOne(rp => rp.Role)
            .WithMany(r => r.Permissions)
            .HasForeignKey(rp => rp.RoleId)
            .OnDelete(DeleteBehavior.Cascade);
        });

        // Configuração do Vínculo N:N (Usuário -> Empresa -> Perfil)
        builder.Entity<UserCompanyRole>(b =>
        {
            b.HasKey(ucr => ucr.Id);
            // Índice composto para buscas instantâneas por Usuário e Empresa
            b.HasIndex(ucr => new { ucr.UserId, ucr.CompanyId });

            // Relacionamentos
            b.HasOne(ucr => ucr.User)
             .WithMany(u => u.UserCompanyRoles)
             .HasForeignKey(ucr => ucr.UserId)
             .OnDelete(DeleteBehavior.Cascade);

            b.HasOne(ucr => ucr.Company)
             .WithMany()
             .HasForeignKey(ucr => ucr.CompanyId)
             .OnDelete(DeleteBehavior.Restrict);

            b.HasOne(ucr => ucr.Role)
             .WithMany()
             .HasForeignKey(ucr => ucr.RoleId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<PrintAgent>(b =>
        {
            b.HasKey(a => a.Id);
            b.Property(a => a.Name).IsRequired().HasMaxLength(100);
            b.Property(a => a.ApiKey).IsRequired().HasMaxLength(128);
            b.HasIndex(a => a.ApiKey).IsUnique();
            b.HasIndex(a => a.Name).IsUnique();
        });

        builder.Entity<Printer>(b =>
        {
            b.HasKey(p => p.Id);
            b.Property(p => p.Name).IsRequired().HasMaxLength(100);
            b.Property(p => p.Target).IsRequired().HasMaxLength(150);

            b.HasOne(p => p.PrintAgent)
             .WithMany(a => a.Printers)
             .HasForeignKey(p => p.PrintAgentId)
             .OnDelete(DeleteBehavior.Cascade);
        });

        builder.Entity<LabelTemplate>(b =>
        {
            b.HasKey(t => t.Id);
            b.Property(t => t.Name).IsRequired().HasMaxLength(100);
            b.Property(t => t.ZplContent).IsRequired();
        });

        builder.Entity<StorageType>(b =>
{
    b.HasKey(s => s.Id);
    b.Property(s => s.Name).IsRequired().HasMaxLength(100);
    b.HasIndex(s => s.Name).IsUnique(); // Nomes de Tipos devem ser únicos
});

        builder.Entity<Warehouse>(b =>
        {
            b.HasKey(w => w.Id);
            b.Property(w => w.Code).IsRequired().HasMaxLength(20);
            b.Property(w => w.Name).IsRequired().HasMaxLength(150);
            b.Property(w => w.ClearanceHeight).HasPrecision(10, 2);
            b.HasIndex(w => w.Code).IsUnique(); // Código P1 não pode repetir
        });

        builder.Entity<Zone>(b =>
        {
            b.HasKey(z => z.Id);
            b.Property(z => z.Code).IsRequired().HasMaxLength(20);
            b.Property(z => z.Name).IsRequired().HasMaxLength(150);

            // Protege contra exclusão acidental em cascata do armazém
            b.HasOne(z => z.Warehouse)
             .WithMany(w => w.Zones)
             .HasForeignKey(z => z.WarehouseId)
             .OnDelete(DeleteBehavior.Restrict);

            b.HasIndex(z => new { z.WarehouseId, z.Code }).IsUnique(); // C1 deve ser único DENTRO do P1
        });

        builder.Entity<Location>(b =>
        {
            b.HasKey(l => l.Id);
            b.Property(l => l.Code).IsRequired().HasMaxLength(50);
            b.Property(l => l.FullPath).IsRequired().HasMaxLength(100);

            b.HasIndex(l => l.FullPath).IsUnique(); // O código de barras lido pelo coletor (P1-C1-B1) é chave única global

            b.HasOne(l => l.Zone)
             .WithMany(z => z.Locations)
             .HasForeignKey(l => l.ZoneId)
             .OnDelete(DeleteBehavior.Restrict);

            b.HasOne(l => l.StorageType)
             .WithMany()
             .HasForeignKey(l => l.StorageTypeId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        // ==========================================
        // MÓDULO DE PRODUTOS E EMBALAGENS
        // ==========================================

        builder.Entity<PackagingType>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).IsRequired().HasMaxLength(20);
            b.Property(x => x.Description).IsRequired().HasMaxLength(150);

            b.HasOne(x => x.Company)
             .WithMany()
             .HasForeignKey(x => x.CompanyId)
             .OnDelete(DeleteBehavior.Restrict);

            // Um código de embalagem (ex: "PAL") é único dentro da mesma Empresa
            b.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
        });

        builder.Entity<Product>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Sku).IsRequired().HasMaxLength(50);
            b.Property(x => x.Description).IsRequired().HasMaxLength(200);
            b.Property(x => x.BaseUnit).IsRequired().HasMaxLength(10);
            b.Property(x => x.BaseBarcode).HasMaxLength(50);
            b.Property(x => x.Ncm).HasMaxLength(10);
            b.Property(x => x.Cest).HasMaxLength(10);

            // Vínculos Restritivos (Não apaga produto se apagar empresa/cliente)
            b.HasOne(x => x.Company)
             .WithMany()
             .HasForeignKey(x => x.CompanyId)
             .OnDelete(DeleteBehavior.Restrict);

            b.HasOne(x => x.Customer)
             .WithMany()
             .HasForeignKey(x => x.CustomerId)
             .OnDelete(DeleteBehavior.Restrict);

            // 1. O SKU deve ser único PARA AQUELE DEPOSITANTE, DENTRO DAQUELA EMPRESA
            b.HasIndex(x => new { x.CompanyId, x.CustomerId, x.Sku }).IsUnique();

            // 2. NOVO: O GTIN/EAN também deve ser único PARA AQUELE DEPOSITANTE (se preenchido)
            b.HasIndex(x => new { x.CompanyId, x.CustomerId, x.BaseBarcode }).IsUnique();
        });

        builder.Entity<ProductPackaging>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Barcode).HasMaxLength(50);

            // Precisão (18 dígitos totais, 4 ou 2 casas decimais)
            b.Property(x => x.ConversionFactor).HasPrecision(18, 4);
            b.Property(x => x.GrossWeight).HasPrecision(18, 4);
            b.Property(x => x.NetWeight).HasPrecision(18, 4);
            b.Property(x => x.LengthMm).HasPrecision(18, 2);
            b.Property(x => x.WidthMm).HasPrecision(18, 2);
            b.Property(x => x.HeightMm).HasPrecision(18, 2);

            // Se o produto for excluído, apagamos as amarrações de embalagem dele (Cascade)
            b.HasOne(x => x.Product)
             .WithMany(p => p.Packagings)
             .HasForeignKey(x => x.ProductId)
             .OnDelete(DeleteBehavior.Cascade);

            // Restringe exclusão de um "Tipo de Embalagem" se ele estiver em uso por algum produto
            b.HasOne(x => x.PackagingType)
             .WithMany()
             .HasForeignKey(x => x.PackagingTypeId)
             .OnDelete(DeleteBehavior.Restrict);

            // Impede que a mesma embalagem seja vinculada duas vezes ao mesmo produto
            b.HasIndex(x => new { x.ProductId, x.PackagingTypeId }).IsUnique();

            // Índice ultrarrápido para bipagem da embalagem via Coletor RF
            b.HasIndex(x => x.Barcode);
        });

        builder.Entity<HandlingUnit>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Lpn).IsRequired().HasMaxLength(50);
            b.Property(x => x.Batch).HasMaxLength(50);
            b.Property(x => x.SerialNumber).HasMaxLength(100);

            b.Property(x => x.InitialQuantity).HasPrecision(18, 4);
            b.Property(x => x.CurrentQuantity).HasPrecision(18, 4);
            b.Property(x => x.UnitValue).HasPrecision(18, 4);
            b.Property(x => x.Version).IsConcurrencyToken();

            b.HasIndex(x => new { x.CompanyId, x.Lpn }).IsUnique();
            b.HasIndex(x => x.CurrentLocationId);
            b.HasIndex(x => new { x.ProductId, x.Status, x.QualityStatus });

            b.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.PackagingType).WithMany().HasForeignKey(x => x.PackagingTypeId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.CurrentLocation).WithMany().HasForeignKey(x => x.CurrentLocationId).OnDelete(DeleteBehavior.Restrict);

        });

        builder.Entity<InventoryTransaction>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.SourceDocumentNumber).HasMaxLength(100);

            b.Property(x => x.QuantityChange).HasPrecision(18, 4);
            b.Property(x => x.BalanceAfter).HasPrecision(18, 4);

            b.HasIndex(x => new { x.CompanyId, x.CustomerId, x.Type, x.CreatedAt });
            b.HasIndex(x => new { x.ProductId, x.HandlingUnitId });
        });

        // NOVO: Mapeamento do Saldo Consolidado
        builder.Entity<InventoryBalance>(b =>
        {
            b.HasKey(x => x.Id);

            b.Property(x => x.TotalExpected).HasPrecision(18, 4);
            b.Property(x => x.TotalAvailable).HasPrecision(18, 4);
            b.Property(x => x.TotalAllocated).HasPrecision(18, 4);
            b.Property(x => x.TotalQuarantine).HasPrecision(18, 4);
            b.Property(x => x.Version).IsConcurrencyToken();

            // A chave de ouro da performance: Consulta por produto é instantânea e única
            b.HasIndex(x => new { x.CompanyId, x.CustomerId, x.ProductId }).IsUnique();

            b.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        });

        // ==========================================
        // MÓDULO DE QUALIDADE
        // ==========================================
        builder.Entity<QualityReason>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).IsRequired().HasMaxLength(50);
            b.Property(x => x.Description).IsRequired().HasMaxLength(200);
            b.HasIndex(x => new { x.CompanyId, x.Code }).IsUnique();
        });

        builder.Entity<QualityEvent>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.HoldNotes).HasMaxLength(1000);
            b.Property(x => x.ReleaseNotes).HasMaxLength(1000);

            b.HasIndex(x => x.HandlingUnitId);
            b.HasIndex(x => new { x.CompanyId, x.IsResolved });

            b.HasOne(x => x.HandlingUnit).WithMany().HasForeignKey(x => x.HandlingUnitId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.HoldReason).WithMany().HasForeignKey(x => x.HoldReasonId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ReleaseReason).WithMany().HasForeignKey(x => x.ReleaseReasonId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.OriginalLocation).WithMany().HasForeignKey(x => x.OriginalLocationId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<QualityEventImage>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.FileName).HasMaxLength(200);

            // O EF Core já mapeia string sem tamanho para TEXT/varchar(max) no PostgreSQL, ideal para Base64
            // Cascade Delete: Se o evento for apagado (raro, mas possível via DB), apaga as imagens junto
            b.HasOne<QualityEvent>().WithMany(x => x.Images).HasForeignKey(x => x.QualityEventId).OnDelete(DeleteBehavior.Cascade);
        });

        // ==========================================
        // MÓDULO DE FATURAMENTO (BILLING)
        // ==========================================
        builder.Entity<BillingService>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).IsRequired().HasMaxLength(150);
            b.HasIndex(x => new { x.CompanyId, x.Name }).IsUnique();
        });

        builder.Entity<CustomerTariff>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.UnitValue).HasPrecision(18, 4);

            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.BillingService).WithMany().HasForeignKey(x => x.BillingServiceId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<BillingCycle>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.ReferenceMonth).IsRequired().HasMaxLength(20);

            b.HasIndex(x => new { x.CompanyId, x.CustomerId, x.ReferenceMonth }).IsUnique();

            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<BillingItem>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Description).IsRequired().HasMaxLength(200);
            b.Property(x => x.ManualNotes).HasMaxLength(1000);

            b.Property(x => x.QuantityTotal).HasPrecision(18, 4);
            b.Property(x => x.ServiceTotal).HasPrecision(18, 4);

            // O pulo do gato: Armazenamento otimizado de JSON no PostgreSQL
            b.Property(x => x.StatementDataJson).HasColumnType("jsonb");

            b.HasOne(x => x.BillingService).WithMany().HasForeignKey(x => x.BillingServiceId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<BillingCycle>().WithMany(x => x.Items).HasForeignKey(x => x.BillingCycleId).OnDelete(DeleteBehavior.Cascade);
        });

        // ==========================================
        // MÓDULO DE INVENTÁRIO (CYCLE COUNT)
        // ==========================================
        builder.Entity<CycleCountPlan>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).IsRequired().HasMaxLength(150);

            b.HasOne(x => x.Customer).WithMany().HasForeignKey(x => x.CustomerId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Zone).WithMany().HasForeignKey(x => x.ZoneId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<CycleCountTask>(b =>
        {
            b.HasKey(x => x.Id);

            b.HasOne(x => x.CycleCountPlan).WithMany(x => x.Tasks).HasForeignKey(x => x.CycleCountPlanId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Location).WithMany().HasForeignKey(x => x.LocationId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<CycleCountRecord>(b =>
        {
            b.HasKey(x => x.Id);

            b.HasOne<CycleCountTask>().WithMany(x => x.Records).HasForeignKey(x => x.CycleCountTaskId).OnDelete(DeleteBehavior.Cascade);

            // Relacionamento com a HU escaneada (opcional, só para Rodada 3+)
            b.HasOne<HandlingUnit>().WithMany().HasForeignKey(x => x.ScannedHandlingUnitId).OnDelete(DeleteBehavior.Restrict);
        });
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var userId = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0";
        var userName = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.Name)?.Value ?? "Sistema";
        var entries = ChangeTracker.Entries<AuditableEntity>().ToList();
        var auditLogs = new List<AuditLog>();

        foreach (var entry in entries)
        {
            if (entry.State == EntityState.Detached || entry.State == EntityState.Unchanged)
                continue;

            var auditLog = new AuditLog
            {
                EntityName = entry.Entity.GetType().Name,
                EntityId = entry.Entity.Id.ToString(),
                UserId = userId,
                UserName = userName
            };

            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = DateTime.UtcNow;
                auditLog.Action = "Create";

                foreach (var prop in entry.Properties)
                {
                    if (!IgnoredAuditProperties.Contains(prop.Metadata.Name))
                        auditLog.Changes[prop.Metadata.Name] = prop.CurrentValue;
                }
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTime.UtcNow;
                auditLog.Action = "Update";

                foreach (var prop in entry.Properties.Where(p => p.IsModified))
                {
                    if (!IgnoredAuditProperties.Contains(prop.Metadata.Name))
                    {
                        auditLog.Changes[$"{prop.Metadata.Name}_Old"] = prop.OriginalValue;
                        auditLog.Changes[$"{prop.Metadata.Name}_New"] = prop.CurrentValue;
                    }
                }

                if (auditLog.Changes.Count == 0)
                    continue;
            }
            else if (entry.State == EntityState.Deleted)
            {
                auditLog.Action = "Delete";
            }

            auditLogs.Add(auditLog);
        }

        var result = await base.SaveChangesAsync(cancellationToken);

        // Enfileiramento não-bloqueante no Channel
        foreach (var log in auditLogs)
        {
            await _auditChannel.WriteAsync(log, cancellationToken);
        }

        return result;
    }
}