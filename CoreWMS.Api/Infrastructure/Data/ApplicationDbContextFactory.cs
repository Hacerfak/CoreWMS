using System;
using System.Collections.Generic;
using System.IO;
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
        var basePath = Directory.GetCurrentDirectory();

        // 1. Tenta carregar as variáveis do arquivo .env (busca no diretório atual e nos diretórios pais)
        var dotEnvVars = LoadDotEnv(basePath);

        // 2. Constrói a configuração padrão
        var configuration = new ConfigurationBuilder()
            .SetBasePath(basePath)
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables()
            .Build();

        // 3. Resolve a ConnectionString com prioridade:
        //    a) ConnectionStrings:Postgres do appsettings/ambiente
        //    b) ConnectionStrings__Postgres do .env
        //    c) Montagem automática a partir de POSTGRES_DB, POSTGRES_USER e POSTGRES_PASSWORD do .env
        var connectionString = configuration.GetConnectionString("Postgres");

        if (string.IsNullOrWhiteSpace(connectionString) && dotEnvVars.TryGetValue("ConnectionStrings__Postgres", out var envConn))
        {
            connectionString = envConn;
        }

        if (string.IsNullOrWhiteSpace(connectionString))
        {
            dotEnvVars.TryGetValue("POSTGRES_DB", out var dbName);
            dotEnvVars.TryGetValue("POSTGRES_USER", out var user);
            dotEnvVars.TryGetValue("POSTGRES_PASSWORD", out var password);
            dotEnvVars.TryGetValue("POSTGRES_HOST", out var host);
            dotEnvVars.TryGetValue("POSTGRES_PORT", out var port);

            dbName ??= "corewms_db";
            user ??= "postgres";
            password ??= "postgres";
            host ??= "localhost";
            port ??= "5432";

            connectionString = $"Host={host};Port={port};Database={dbName};Username={user};Password={password};";
        }

        // 4. Se a connection string apontar para o host interno do Docker ("postgres"),
        //    substitui para "localhost" para permitir que a CLI na máquina host se conecte ao container
        if (connectionString.Contains("Host=postgres", StringComparison.OrdinalIgnoreCase))
        {
            connectionString = connectionString.Replace("Host=postgres", "Host=localhost", StringComparison.OrdinalIgnoreCase);
        }

        var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();
        optionsBuilder.UseNpgsql(connectionString);

        var auditChannel = new AuditChannel();
        var httpContextAccessor = new HttpContextAccessor();

        return new ApplicationDbContext(optionsBuilder.Options, auditChannel, httpContextAccessor);
    }

    private static Dictionary<string, string> LoadDotEnv(string startPath)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var dir = new DirectoryInfo(startPath);

        for (int i = 0; i < 4 && dir != null; i++)
        {
            var envFile = Path.Combine(dir.FullName, ".env");
            if (File.Exists(envFile))
            {
                foreach (var line in File.ReadAllLines(envFile))
                {
                    var trimmed = line.Trim();
                    if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("#"))
                        continue;

                    var separatorIndex = trimmed.IndexOf('=');
                    if (separatorIndex <= 0)
                        continue;

                    var key = trimmed.Substring(0, separatorIndex).Trim();
                    var value = trimmed.Substring(separatorIndex + 1).Trim();

                    // Remove aspas simples ou duplas ao redor do valor, caso existam
                    if ((value.StartsWith("\"") && value.EndsWith("\"")) ||
                        (value.StartsWith("'") && value.EndsWith("'")))
                    {
                        value = value.Substring(1, value.Length - 2);
                    }

                    result[key] = value;
                }
                break;
            }

            dir = dir.Parent;
        }

        return result;
    }
}