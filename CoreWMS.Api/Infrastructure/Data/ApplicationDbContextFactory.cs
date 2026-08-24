using CoreWMS.Api.Infrastructure.Audit;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;

namespace CoreWMS.Api.Infrastructure.Data;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        var basePath = AppDomain.CurrentDomain.BaseDirectory;

        // Constrói a configuração para ler as credenciais reais no CLI do EF Core
        var configuration = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddJsonFile("appsettings.Local.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("Postgres")
            ?? "Host=localhost;Database=corewms_db;Username=postgres;Password=SuaSenhaPostgresSegura123!";

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        var auditChannel = new AuditChannel();
        var httpContextAccessor = new HttpContextAccessor();

        return new ApplicationDbContext(optionsBuilder.Options, auditChannel, httpContextAccessor);
    }
}