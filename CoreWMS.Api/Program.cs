using System.Text;
using CoreWMS.Api.Features.Audit;
using CoreWMS.Api.Features.Identity.AssignUserToCompany;
using CoreWMS.Api.Features.Identity.Companies;
using CoreWMS.Api.Features.Customers;
using CoreWMS.Api.Features.Identity.Login;
using CoreWMS.Api.Features.Identity.Roles;
using CoreWMS.Api.Features.Identity.Users;
using CoreWMS.Api.Features.Printing;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using FluentValidation;
using CoreWMS.Api.Infrastructure.Behaviors;
using CoreWMS.Api.Infrastructure.Exceptions;
using CoreWMS.Api.Infrastructure.Swagger;

var builder = WebApplication.CreateBuilder(args);

// 1. Configurações Locais de Ambiente
builder.Configuration
    .SetBasePath(AppDomain.CurrentDomain.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true)
    .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));
builder.Services.AddHttpContextAccessor();

// 2. Política Estrita de CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("CoreWmsCorsPolicy", policy =>
    {
        policy.WithOrigins("http://localhost:3000", "https://app.corewms.com.br")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

// 3. Otimização de Rate Limiting por Tipo de Operação
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Login: 5 tentativas/minuto
    options.AddFixedWindowLimiter("loginPolicy", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });

    // Refresh Token: 10 tentativas/minuto
    options.AddFixedWindowLimiter("refreshPolicy", opt =>
    {
        opt.PermitLimit = 10;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueLimit = 0;
    });
});

builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    options.SerializerOptions.PropertyNameCaseInsensitive = true;
    options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});

// 4. Arquitetura de Auditoria Assíncrona via Channel
builder.Services.AddSingleton<AuditChannel>();
builder.Services.AddHostedService<MongoAuditWorker>();

// Banco de Dados PostgreSQL
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// Serviços de Segurança e Cache
builder.Services.AddScoped<JwtTokenGenerator>();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IPermissionCacheService, PermissionCacheService>();

// 1. Registra o Tratamento Global de Exceções
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();
builder.Services.AddProblemDetails();

// 2. Registra todos os Validadores do projeto automaticamente
builder.Services.AddValidatorsFromAssembly(typeof(Program).Assembly);

// 3. Adiciona o MediatR junto com o Interceptador de Validação
builder.Services.AddMediatR(cfg =>
{
    cfg.RegisterServicesFromAssembly(typeof(Program).Assembly);
    cfg.AddOpenBehavior(typeof(ValidationBehavior<,>)); // Adiciona o segurança na porta
});

builder.Services.AddSingleton<IZeusConfigurator, ZeusConfigurator>();
builder.Services.AddScoped<ISefazConsultaCadastroService, SefazConsultaCadastroService>();
builder.Services.AddScoped<ISefazStatusServicoService, SefazStatusServicoService>();

builder.Services.AddScoped<IPrintService, PrintService>();

var jwtSecret = builder.Configuration["JwtSettings:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
    throw new InvalidOperationException("ERRO DE SEGURANÇA: A chave 'JwtSettings:Secret' deve conter no mínimo 32 caracteres.");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "CoreWMS",
            ValidAudience = "CoreWMS.Users",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
    });
builder.Services.AddAuthorization();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "CoreWMS API", Version = "v1" });
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "Insira o token JWT desta forma: Bearer {seu_token}",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });
    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            },
            Array.Empty<string>()
        }
    });
    c.OperationFilter<SwaggerCompanyHeaderFilter>();
});

var app = builder.Build();

await DatabaseSeeder.SeedAsync(app.Services);

// 5. Middleware de Security Headers
app.Use(async (context, next) =>
{
    context.Response.Headers.Append("X-Content-Type-Options", "nosniff");
    context.Response.Headers.Append("X-Frame-Options", "DENY");
    context.Response.Headers.Append("X-XSS-Protection", "1; mode=block");
    context.Response.Headers.Append("Referrer-Policy", "strict-origin-when-cross-origin");
    await next();
});

app.UseCors("CoreWmsCorsPolicy");
app.UseRateLimiter();
app.UseStaticFiles();

app.UseSwagger();
app.UseSwaggerUI(c =>
{
    c.SwaggerEndpoint("/swagger/v1/swagger.json", "CoreWMS API v1");
    c.InjectJavascript("/swagger/swagger-refresh.js");
});

app.UseAuthentication();
app.UseAuthorization();
app.UseExceptionHandler();

app.MapAuditLogEndpoints();
app.MapLoginEndpoint();
app.MapRefreshTokenEndpoint();
app.MapCompanyCrudEndpoints();
app.MapCustomerCrudEndpoints();
app.MapUserCrudEndpoints();
app.MapRoleCrudEndpoints();
app.MapAssignUserEndpoint();
app.MapPrintEndpoints();
app.MapPrintingCrudEndpoints();

app.MapHub<PrintHub>("/hubs/print");

app.Run();