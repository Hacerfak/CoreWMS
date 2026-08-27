using System.Security.Claims;
using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Features.Customers.Entities;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Features.Printing.Entities;
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