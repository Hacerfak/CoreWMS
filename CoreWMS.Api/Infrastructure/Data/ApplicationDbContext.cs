using System.Security.Claims;
using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Audit;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Infrastructure.Data;

public class ApplicationDbContext : DbContext
{
    private readonly IAuditService _auditService;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        IAuditService auditService,
        IHttpContextAccessor httpContextAccessor) : base(options)
    {
        _auditService = auditService;
        _httpContextAccessor = httpContextAccessor;
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Company> Companies => Set<Company>();
    public DbSet<Role> Roles => Set<Role>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserCompanyRole> UserCompanyRoles => Set<UserCompanyRole>();

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
    }

    public override async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        // 1. Pega o ID do usuário que fez a requisição HTTP (Token JWT)
        var userId = _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        var entries = ChangeTracker.Entries<AuditableEntity>().ToList();
        var auditLogs = new List<AuditLog>();

        // 2. Prepara os logs e atualiza as datas de auditoria (CreatedAt/UpdatedAt)
        foreach (var entry in entries)
        {
            if (entry.State == EntityState.Detached || entry.State == EntityState.Unchanged)
                continue;

            var auditLog = new AuditLog
            {
                EntityName = entry.Entity.GetType().Name,
                EntityId = entry.Entity.Id.ToString(),
                UserId = userId ?? "Sistema" // Se for o Seed inicial rodando sem token, fica como "Sistema"
            };

            if (entry.State == EntityState.Added)
            {
                entry.Entity.CreatedAt = DateTime.UtcNow;
                auditLog.Action = "Create";

                foreach (var prop in entry.Properties)
                {
                    if (prop.Metadata.Name != "PasswordHash") // Nunca logue senhas!
                        auditLog.Changes[prop.Metadata.Name] = prop.CurrentValue;
                }
            }
            else if (entry.State == EntityState.Modified)
            {
                entry.Entity.UpdatedAt = DateTime.UtcNow;
                auditLog.Action = "Update";

                foreach (var prop in entry.Properties.Where(p => p.IsModified))
                {
                    if (prop.Metadata.Name != "PasswordHash")
                        auditLog.Changes[$"{prop.Metadata.Name}_Old"] = prop.OriginalValue;
                    auditLog.Changes[$"{prop.Metadata.Name}_New"] = prop.CurrentValue;
                }
            }
            else if (entry.State == EntityState.Deleted)
            {
                auditLog.Action = "Delete";
            }

            auditLogs.Add(auditLog);
        }

        // 3. Salva no Postgres (Transacional)
        var result = await base.SaveChangesAsync(cancellationToken);

        // 4. Salva no MongoDB em paralelo (Auditoria Assíncrona)
        if (auditLogs.Count > 0)
        {
            var auditTasks = auditLogs.Select(log => _auditService.LogAsync(log, cancellationToken));
            await Task.WhenAll(auditTasks);
        }

        return result;
    }
}