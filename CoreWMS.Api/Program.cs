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

// Configuração Global do MongoDB para saber como salvar Guids
BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));

// Adiciona acesso ao HttpContext (Necessário para pegar o JWT logado no Banco de Dados)
builder.Services.AddHttpContextAccessor();

// Configuração de Rate Limiting (Proteção contra força bruta)
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("loginPolicy", opt =>
    {
        opt.PermitLimit = 5; // 5 requisições permitidas
        opt.Window = TimeSpan.FromMinutes(1); // a cada 1 minuto
        opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
        opt.QueueLimit = 0; // Não coloca em fila, rejeita na hora
    });

    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

// Registra o serviço de Auditoria do Mongo
builder.Services.AddScoped<IAuditService, MongoAuditService>();

// 1. Configurações de Banco de Dados
builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// 2. Registro dos nossos serviços
builder.Services.AddScoped<JwtTokenGenerator>();
builder.Services.AddMemoryCache();
builder.Services.AddSignalR();

// Registro dos Handlers CQRS (Nativo)
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

// 3. Configuração do JWT Authentication
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
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("SuperSecretKeyThatNeedsToBeAtLeast32BytesLong!")) // Em produção, vai pro Vault ou Env
        };
    });
builder.Services.AddAuthorization();

// 4. Configuração do Swagger com suporte a Token JWT
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo { Title = "CoreWMS API", Version = "v1" });

    // Configura o botão "Authorize" no topo do Swagger
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

// 5. Seed e Middleware do Swagger
await DatabaseSeeder.SeedAsync(app.Services);

app.UseRateLimiter();

app.UseSwagger();
app.UseSwaggerUI();

app.UseAuthentication();
app.UseAuthorization();

// 6. Mapeamento dos Endpoints (VSA)
app.MapAuditLogEndpoints();
app.MapLoginEndpoint();
app.MapRefreshTokenEndpoint();
app.MapCompanyCrudEndpoints();
app.MapUserCrudEndpoints();
app.MapRoleCrudEndpoints();
app.MapAssignUserEndpoint();

app.MapPrintEndpoints();

// 3. Mapeamento do Hub de WebSockets do SignalR
app.MapHub<PrintHub>("/hubs/print");

app.Run();