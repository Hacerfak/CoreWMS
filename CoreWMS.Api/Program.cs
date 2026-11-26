using System.Data;
using System.Text;
using System.Threading.RateLimiting;
using CoreWMS.Api.Features.Printing;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Infrastructure.Inventory;
using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Behaviors;
using CoreWMS.Api.Infrastructure.Caching;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Exceptions;
using CoreWMS.Api.Infrastructure.Extensions;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Emissao;
using CoreWMS.Api.Infrastructure.Fiscal.NfeParser;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Infrastructure.Services.Billing;
using CoreWMS.Api.Infrastructure.Services.Email;
using CoreWMS.Api.Infrastructure.Services.Inventory;
using CoreWMS.Api.Infrastructure.Storage;
using CoreWMS.Api.Infrastructure.Swagger;
using FluentValidation;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using MongoDB.Driver;
using Npgsql;

AppContext.SetSwitch("Npgsql.EnableGSS", false);

var builder = WebApplication.CreateBuilder(args);

// 1. Configurações de Ambiente (appsettings + Variáveis do Docker Compose)
builder.Configuration
    .SetBasePath(AppDomain.CurrentDomain.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true)
    .AddEnvironmentVariables();

BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));

builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ITenantProvider, TenantProvider>();

// Configuração de Proxy Reverso (Nginx -> Kestrel) para identificar o IP real do cliente
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

// 2. Política Estrita de CORS (100% orientada por variável de ambiente Cors__AllowedOrigins)
var corsOriginsRaw = builder.Configuration["Cors:AllowedOrigins"];
var configuredOrigins = !string.IsNullOrWhiteSpace(corsOriginsRaw)
    ? corsOriginsRaw.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    : builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

var allowedOrigins = configuredOrigins
    .Select(o => o.Trim().TrimEnd('/'))
    .Where(o => !string.IsNullOrWhiteSpace(o))
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray();

if (allowedOrigins.Length == 0)
    throw new InvalidOperationException("ERRO DE SEGURANÇA: A variável 'Cors__AllowedOrigins' deve conter ao menos uma origem permitida.");

builder.Services.AddCors(options =>
{
    options.AddPolicy("CoreWmsCorsPolicy", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 3. Rate Limiting Particionado por IP
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.OnRejected = async (context, token) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        await context.HttpContext.Response.WriteAsJsonAsync(new
        {
            Message = "Muitas tentativas em um curto período. Aguarde 1 minuto e tente novamente."
        }, token);
    };

    options.AddPolicy("loginPolicy", httpContext =>
    {
        var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(clientIp, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 5,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });
    });

    options.AddPolicy("refreshPolicy", httpContext =>
    {
        var clientIp = httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(clientIp, _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 15,
            Window = TimeSpan.FromMinutes(1),
            QueueLimit = 0
        });
    });
});

builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
    options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});

// 4. Arquitetura de Auditoria e Faturamento Assíncronos via Channel
builder.Services.AddSingleton<AuditChannel>();
builder.Services.AddHostedService<MongoAuditWorker>();

builder.Services.AddSingleton<BillingChannel>();
builder.Services.AddHostedService<BillingBackgroundWorker>();

// Banco de Dados PostgreSQL e MongoDB
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

builder.Services.AddSingleton<IMongoClient>(sp =>
    new MongoClient(builder.Configuration.GetConnectionString("MongoDb")));

// Serviços de Segurança e Cache
builder.Services.AddScoped<IJwtTokenGenerator, JwtTokenGenerator>();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IPermissionCacheService, PermissionCacheService>();

// Tratamento Global de Exceções e Pipeline MediatR
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

builder.Services.AddValidatorsFromAssembly(typeof(Program).Assembly);

builder.Services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssembly(typeof(Program).Assembly);
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>));
});

// Serviços Fiscais (SEFAZ / NF-e)
builder.Services.AddSingleton<IZeusConfigurator, ZeusConfigurator>();
builder.Services.AddScoped<ISefazConsultaCadastroService, SefazConsultaCadastroService>();
builder.Services.AddScoped<ISefazStatusServicoService, SefazStatusServicoService>();
builder.Services.AddScoped<ISefazDistDFeService, SefazDistDFeService>();
builder.Services.AddSingleton<INfeParserService, NfeParserService>();
builder.Services.AddScoped<NfeBuilderService>();

// Impressão Térmica e E-mail
builder.Services.AddScoped<IPrintService, PrintService>();
builder.Services.AddSingleton<IPrintConnectionManager, PrintConnectionManager>();
builder.Services.AddSingleton<IZplTemplateEngine, ZplTemplateEngine>();
builder.Services.AddScoped<IEmailSenderService, CompanyEmailSenderService>();

// Performance, Inventário, Armazenamento e Faturamento
builder.Services.AddSingleton<KardexChannel>();
builder.Services.AddHostedService<KardexWorker>();
builder.Services.AddScoped<IMasterDataCacheService, MasterDataCacheService>();
builder.Services.AddScoped<IDirectLocationAllocationValidator, DirectLocationAllocationValidator>();

builder.Services.AddHostedService<ImageStorageCleanupWorker>();
builder.Services.AddScoped<ILocalImageStorageService, LocalImageStorageService>();

builder.Services.AddScoped<IDbConnection>(sp =>
    new NpgsqlConnection(builder.Configuration.GetConnectionString("Postgres")));

builder.Services.AddScoped<BillingEngineService>();

// Validação de Chaves Críticas na Inicialização
var jwtSecret = builder.Configuration["JwtSettings:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
    throw new InvalidOperationException("ERRO DE SEGURANÇA: A variável 'JwtSettings__Secret' deve conter no mínimo 32 caracteres.");

var jwtIssuer = builder.Configuration["JwtSettings:Issuer"] ?? "CoreWMS";
var jwtAudience = builder.Configuration["JwtSettings:Audience"] ?? "CoreWMS.Users";

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            ClockSkew = TimeSpan.FromMinutes(1),
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "CoreWMS API", Version = "v1" });
    c.AddSecurityDefinition("bearer", new OpenApiSecurityScheme
    {
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        Description = "JWT Authorization header using the Bearer scheme."
    });
    c.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("bearer", document)] = []
    });
    c.OperationFilter<SwaggerCompanyHeaderFilter>();
});

var app = builder.Build();

await DatabaseSeeder.SeedAsync(app.Services);

// 1. Cabeçalhos de Proxy Reverso (Sempre primeiro)
app.UseForwardedHeaders();

// 2. Tratamento Global de Exceções
app.UseExceptionHandler();

// 3. Security Headers
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    context.Response.Headers.Append("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    await next();
});

// 4. CORS e Rate Limiter
app.UseCors("CoreWmsCorsPolicy");
app.UseRateLimiter();

// 5. Swagger restrito apenas ao ambiente de Desenvolvimento
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "CoreWMS API v1");
    });
}

// 6. Autenticação e Autorização
app.UseAuthentication();
app.UseAuthorization();

// 7. Mapeamento Automático dos Endpoints e SignalR
app.MapAllEndpoints();
app.MapHub<PrintHub>("/hubs/print").AllowAnonymous();

app.Run();