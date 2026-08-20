using CoreWMS.Api.Infrastructure.Audit;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CoreWMS.Api.Infrastructure.Data;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();

        // String dummy só para o EF ler a estrutura das classes e montar a Migration
        optionsBuilder.UseNpgsql("Host=localhost;Database=dummy_db;Username=postgres;Password=dummy");

        // Instâncias MOCK apenas para satisfazer o construtor do DbContext em tempo de design
        var dummyAuditService = new DummyAuditService();
        var dummyHttpContextAccessor = new HttpContextAccessor();

        return new ApplicationDbContext(optionsBuilder.Options, dummyAuditService, dummyHttpContextAccessor);
    }
}

// Dummy service apenas para o EF Core não reclamar no CLI
internal class DummyAuditService : IAuditService
{
    public Task LogAsync(AuditLog log, CancellationToken ct = default) => Task.CompletedTask;
}