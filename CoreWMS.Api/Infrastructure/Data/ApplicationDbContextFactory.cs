using CoreWMS.Api.Infrastructure.Audit;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration;
using System.IO;

namespace CoreWMS.Api.Infrastructure.Data;

public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
{
    public ApplicationDbContext CreateDbContext(string[] args)
    {
        // Usa o diretório atual de onde o comando CLI está sendo executado (raiz do projeto)
        var basePath = Directory.GetCurrentDirectory();

        var configuration = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: false)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddJsonFile("appsettings.Local.json", optional: true) // Vai ler daqui com sucesso
            .AddEnvironmentVariables()
            .Build();

        var connectionString = configuration.GetConnectionString("Postgres")
            ?? throw new InvalidOperationException("A ConnectionString 'Postgres' não foi encontrada. Verifique o appsettings.Local.json na raiz do projeto.");

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        var auditChannel = new AuditChannel();
        var httpContextAccessor = new HttpContextAccessor();

        return new ApplicationDbContext(optionsBuilder.Options, auditChannel, httpContextAccessor);
    }
}