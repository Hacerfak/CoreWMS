using System.Text;
using CoreWMS.Api.Features.Identity.Login;
using CoreWMS.Api.Features.Identity.Users;
using CoreWMS.Api.Features.Identity.Roles;
using CoreWMS.Api.Features.Identity.AssignUserToCompany;
using CoreWMS.Api.Features.Identity.Companies;
using CoreWMS.Api.Features.Audit;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Infrastructure.Auth;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Fiscal.Configuration;
using CoreWMS.Api.Infrastructure.Fiscal.Queries;
using CoreWMS.Api.Infrastructure.Security;
using CoreWMS.Api.Features.Printing;
using CoreWMS.Api.Infrastructure.Printing;
using CoreWMS.Api.Core.CQRS;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Serializers;
using Microsoft.AspNetCore.RateLimiting;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);

// 1. CARREGAMENTO PRECOCE DA CONFIGURAÇÃO LOCAL (Sobrescreve appsettings.json e appsettings.Development.json)
builder.Configuration
    .SetBasePath(AppDomain.CurrentDomain.BaseDirectory)
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true)
    .AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true)
    .AddEnvironmentVariables();

// Configuração Global do MongoDB para Guids
BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));

builder.Services.AddHttpContextAccessor();

// Rate Limiting
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("loginPolicy", opt =>
    {
        opt.PermitLimit = 5;
        opt.Window = TimeSpan.FromMinutes(1);
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0;
    });

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

// Prevenção contra loops circulares em JSON
builder.Services.Configure<Microsoft.AspNetCore.Http.Json.JsonOptions>(options =>
{
    options.SerializerOptions.ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
});

// Registra o serviço de Auditoria do Mongo (Agora lendo a string autenticada de appsettings.Local.json)
builder.Services.AddScoped<IAuditService, MongoAuditService>();

// Configuração do PostgreSQL
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// Registro dos Serviços e Caches
builder.Services.AddScoped<JwtTokenGenerator>();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR();
builder.Services.AddSingleton<IPermissionCacheService, PermissionCacheService>();

// Handlers CQRS
builder.Services.AddScoped<ICommandHandler<LoginCommand, IResult>, LoginCommandHandler>();
builder.Services.AddScoped<ICommandHandler<RefreshTokenCommand, IResult>, RefreshTokenHandler>();

builder.Services.AddScoped<ICommandHandler<CreateUserCommand, IResult>, CreateUserHandler>();
builder.Services.AddScoped<IQueryHandler<ListUsersQuery, IResult>, ListUsersHandler>();
builder.Services.AddScoped<ICommandHandler<UpdateUserCommand, IResult>, UpdateUserHandler>();
builder.Services.AddScoped<ICommandHandler<DeleteUserCommand, IResult>, DeleteUserHandler>();

builder.Services.AddScoped<IQueryHandler<AuditLogFilterQuery, IResult>, ListAuditLogsHandler>();

builder.Services.AddScoped<ICommandHandler<CreateRoleCommand, IResult>, CreateRoleHandler>();
builder.Services.AddScoped<ICommandHandler<UpdateRoleCommand, IResult>, UpdateRoleHandler>();
builder.Services.AddScoped<ICommandHandler<DeleteRoleCommand, IResult>, DeleteRoleHandler>();
builder.Services.AddScoped<IQueryHandler<ListRolesQuery, IResult>, ListRolesHandler>();

builder.Services.AddScoped<ICommandHandler<AssignUserCommand, IResult>, AssignUserHandler>();
builder.Services.AddScoped<IQueryHandler<ListCompaniesQuery, IResult>, ListCompaniesHandler>();
builder.Services.AddScoped<ICommandHandler<CreateCompanyCommand, IResult>, CreateCompanyHandler>();
builder.Services.AddScoped<IQueryHandler<ListAllCompaniesQuery, IResult>, ListAllCompaniesHandler>();
builder.Services.AddScoped<ICommandHandler<UpdateCompanyCommand, IResult>, UpdateCompanyHandler>();
builder.Services.AddScoped<ICommandHandler<DeleteCompanyCommand, IResult>, DeleteCompanyHandler>();

builder.Services.AddSingleton<IZeusConfigurator, ZeusConfigurator>();
builder.Services.AddScoped<ISefazConsultaCadastroService, SefazConsultaCadastroService>();
builder.Services.AddScoped<ISefazStatusServicoService, SefazStatusServicoService>();

builder.Services.AddScoped<IPrintService, PrintService>();
builder.Services.AddScoped<ICommandHandler<SendTestPrintCommand, IResult>, SendTestPrintHandler>();
builder.Services.AddScoped<ICommandHandler<CreateAgentCommand, IResult>, CreateAgentHandler>();
builder.Services.AddScoped<ICommandHandler<CreatePrinterCommand, IResult>, CreatePrinterHandler>();
builder.Services.AddScoped<ICommandHandler<CreateLabelTemplateCommand, IResult>, CreateLabelTemplateHandler>();

// Validação de Segurança do Segredo JWT
var jwtSecret = builder.Configuration["JwtSettings:Secret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || jwtSecret.Length < 32)
{
    throw new InvalidOperationException("ERRO DE SEGURANÇA: A chave 'JwtSettings:Secret' deve conter no mínimo 32 caracteres.");
}

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

// Documentação Swagger
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
});

var app = builder.Build();

// Seed de dados e Middlewares
await DatabaseSeeder.SeedAsync(app.Services);

app.UseRateLimiter();
app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

// Mapeamento de Rotas
app.MapAuditLogEndpoints();
app.MapLoginEndpoint();
app.MapRefreshTokenEndpoint();
app.MapCompanyCrudEndpoints();
app.MapUserCrudEndpoints();
app.MapRoleCrudEndpoints();
app.MapAssignUserEndpoint();

app.MapPrintEndpoints();
app.MapPrintingCrudEndpoints();

app.MapHub<PrintHub>("/hubs/print");

app.Run();