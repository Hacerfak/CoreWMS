using System.Security.Claims;
using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Features.Inbound.Entities;
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
    public DbSet<InboundOrder> InboundOrders => Set<InboundOrder>();
    public DbSet<InboundOrderItem> InboundOrderItems => Set<InboundOrderItem>();
    public DbSet<HandlingUnit> HandlingUnits => Set<HandlingUnit>();

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
            b.Property(l => l.Aisle).HasMaxLength(10);
            b.Property(l => l.Building).HasMaxLength(10);
            b.Property(l => l.Level).HasMaxLength(10);
            b.Property(l => l.Slot).HasMaxLength(10);

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

        builder.Entity<InboundOrder>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.AccessKey).IsRequired().HasMaxLength(44);
            b.Property(x => x.Number).IsRequired().HasMaxLength(20);
            b.Property(x => x.Series).HasMaxLength(10);
            b.Property(x => x.IssuerCnpj).IsRequired().HasMaxLength(14);
            b.Property(x => x.IssuerName).IsRequired().HasMaxLength(150);
            b.Property(x => x.XmlContent).IsRequired(); // Coluna TEXT no Postgres (ideal para XML)

            b.HasOne(x => x.Company)
             .WithMany()
             .HasForeignKey(x => x.CompanyId)
             .OnDelete(DeleteBehavior.Restrict);

            b.HasOne(x => x.Customer)
             .WithMany()
             .HasForeignKey(x => x.CustomerId)
             .OnDelete(DeleteBehavior.Restrict);

            // Impede o upload da mesma NF-e para a mesma Empresa
            b.HasIndex(x => new { x.CompanyId, x.AccessKey }).IsUnique();
        });

        builder.Entity<InboundOrderItem>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.SkuOriginal).IsRequired().HasMaxLength(50);
            b.Property(x => x.BarcodeOriginal).HasMaxLength(50);
            b.Property(x => x.DescriptionOriginal).IsRequired().HasMaxLength(200);
            b.Property(x => x.UnitOriginal).IsRequired().HasMaxLength(10);
            b.Property(x => x.ExpectedQty).HasPrecision(18, 4);
            b.Property(x => x.UnitValue).HasPrecision(18, 4);
            b.Property(x => x.TotalValue).HasPrecision(18, 4);
            b.Property(x => x.Ncm).HasMaxLength(10);
            b.Property(x => x.Cest).HasMaxLength(10);
            b.Property(x => x.BatchOriginal).HasMaxLength(50);

            b.HasOne(x => x.InboundOrder)
             .WithMany(o => o.Items)
             .HasForeignKey(x => x.InboundOrderId)
             .OnDelete(DeleteBehavior.Cascade); // Excluir a ordem exclui os itens

            b.HasOne(x => x.Product)
             .WithMany()
             .HasForeignKey(x => x.ProductId)
             .OnDelete(DeleteBehavior.Restrict); // Não apaga o item se apagar o produto (Mantém rastreabilidade)

            b.HasOne(x => x.DockLocation)
             .WithMany()
             .HasForeignKey(x => x.DockLocationId)
             .OnDelete(DeleteBehavior.Restrict);
        });

        builder.Entity<HandlingUnit>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.LpnCode).IsRequired().HasMaxLength(50);
            b.HasIndex(x => new { x.CompanyId, x.LpnCode }).IsUnique(); // LPN Único por Empresa
            b.Property(x => x.Quantity).HasPrecision(18, 4);

            b.HasOne(x => x.Company).WithMany().HasForeignKey(x => x.CompanyId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.ProductPackaging).WithMany().HasForeignKey(x => x.ProductPackagingId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.InboundOrder).WithMany().HasForeignKey(x => x.InboundOrderId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.InboundOrderItem).WithMany().HasForeignKey(x => x.InboundOrderItemId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.CurrentLocation).WithMany().HasForeignKey(x => x.CurrentLocationId).OnDelete(DeleteBehavior.Restrict);
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