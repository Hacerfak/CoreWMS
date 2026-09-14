using CoreWMS.Api.Features.Billing.Entities;
using CoreWMS.Api.Infrastructure.Services.Billing;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using Mapster;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Billing;

// ==========================================
// 1. DTOs
// ==========================================
public record BillingServiceDto(Guid Id, string Name, string Type, string? SqlTemplate);
public record CustomerTariffDto(Guid Id, Guid CustomerId, string CustomerName, Guid BillingServiceId, string ServiceName, decimal UnitValue, DateTime ValidFrom, DateTime? ValidTo);
public record BillingCycleDto(Guid Id, string ReferenceMonth, DateTime StartDate, DateTime EndDate, string Status, decimal TotalAmount);

// ==========================================
// 2. COMMANDS & QUERIES
// ==========================================
public record CreateBillingServiceCommand(string Name, BillingServiceType Type, string? SqlTemplate) : IRequest<IResult>;
public record CreateCustomerTariffCommand(Guid CustomerId, Guid BillingServiceId, decimal UnitValue, DateTime ValidFrom, DateTime? ValidTo) : IRequest<IResult>;
public record GenerateBillingCycleCommand(Guid CustomerId, string ReferenceMonth, DateTime StartDate, DateTime EndDate) : IRequest<IResult>;
public record CloseBillingCycleCommand(Guid Id) : IRequest<IResult>;

public record ListBillingServicesQuery() : IRequest<IResult>;
public record ListCustomerTariffsQuery(Guid CustomerId) : IRequest<IResult>;

// ==========================================
// 3. HANDLERS (CADASTROS)
// ==========================================
public class CreateBillingServiceHandler : IRequestHandler<CreateBillingServiceCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    public CreateBillingServiceHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(CreateBillingServiceCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        if (request.Type == BillingServiceType.Automatic_SQL && string.IsNullOrWhiteSpace(request.SqlTemplate))
            return Results.BadRequest(new { Message = "Serviços automáticos exigem uma query SQL." });

        var service = new BillingService(companyId, request.Name, request.Type, request.SqlTemplate);
        _db.BillingServices.Add(service);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { service.Id });
    }
}

public class CreateCustomerTariffHandler : IRequestHandler<CreateCustomerTariffCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IHttpContextAccessor _http;
    public CreateCustomerTariffHandler(ApplicationDbContext db, IHttpContextAccessor http) { _db = db; _http = http; }

    public async Task<IResult> Handle(CreateCustomerTariffCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        var tariff = new CustomerTariff(companyId, request.CustomerId, request.BillingServiceId, request.UnitValue, request.ValidFrom, request.ValidTo);
        _db.CustomerTariffs.Add(tariff);
        await _db.SaveChangesAsync(ct);

        return Results.Ok(new { tariff.Id });
    }
}

// ==========================================
// 4. HANDLERS (O MOTOR DE FATURAMENTO)
// ==========================================
public class GenerateBillingCycleHandler : IRequestHandler<GenerateBillingCycleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly BillingEngineService _engine;
    private readonly IHttpContextAccessor _http;

    public GenerateBillingCycleHandler(ApplicationDbContext db, BillingEngineService engine, IHttpContextAccessor http)
    { _db = db; _engine = engine; _http = http; }

    public async Task<IResult> Handle(GenerateBillingCycleCommand request, CancellationToken ct)
    {
        if (!Guid.TryParse(_http.HttpContext?.Request.Headers["X-Company-Id"].ToString(), out var companyId)) return Results.BadRequest();

        // 1. Verifica se já existe fatura para esse mês
        var existingCycle = await _db.BillingCycles.Include(c => c.Items).FirstOrDefaultAsync(c => c.CompanyId == companyId && c.CustomerId == request.CustomerId && c.ReferenceMonth == request.ReferenceMonth, ct);

        if (existingCycle != null)
        {
            if (existingCycle.Status == BillingStatus.Closed)
                return Results.BadRequest(new { Message = "Já existe uma fatura fechada para este período." });

            // Se for Rascunho, apaga a fatura antiga para recalcular
            _db.BillingCycles.Remove(existingCycle);
            await _db.SaveChangesAsync(ct);
        }

        // 2. Cria a nova Fatura (Draft)
        var cycle = new BillingCycle(companyId, request.CustomerId, request.ReferenceMonth, request.StartDate, request.EndDate);
        _db.BillingCycles.Add(cycle);

        // 3. Busca todas as Tarifas ativas do cliente que interceptam o período da fatura
        var activeTariffs = await _db.CustomerTariffs
            .Include(t => t.BillingService)
            .Where(t => t.CompanyId == companyId && t.CustomerId == request.CustomerId &&
                        t.ValidFrom <= request.EndDate &&
                        (t.ValidTo == null || t.ValidTo >= request.StartDate))
            .ToListAsync(ct);

        // 4. Roda o Motor Dapper para cada serviço Automático
        foreach (var tariff in activeTariffs.Where(t => t.BillingService.Type == BillingServiceType.Automatic_SQL))
        {
            try
            {
                var billingItem = await _engine.ExecuteServiceAsync(cycle, tariff.BillingService, tariff);
                _db.BillingItems.Add(billingItem);
            }
            catch (Exception ex)
            {
                // Registra o erro na linha, mas não para o faturamento dos outros serviços
                var errorItem = new BillingItem(cycle.Id, tariff.BillingServiceId, $"{tariff.BillingService.Name} (ERRO)", 0, 0, null, $"Falha SQL: {ex.Message}");
                _db.BillingItems.Add(errorItem);
            }
        }

        // 5. Adiciona linhas zeradas para serviços Manuais, para o operador preencher depois
        foreach (var tariff in activeTariffs.Where(t => t.BillingService.Type == BillingServiceType.Manual_Entry))
        {
            _db.BillingItems.Add(new BillingItem(cycle.Id, tariff.BillingServiceId, tariff.BillingService.Name, 0, 0, null, "Aguardando apontamento manual"));
        }

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { cycle.Id });
    }
}

// ==========================================
// 5. ENDPOINTS
// ==========================================
public static class BillingEndpoints
{
    public static void MapBillingEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/billing").WithTags("Billing").RequireAuthorization();

        // Cadastros
        group.MapPost("/services", async (CreateBillingServiceCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Billing.Manage);
        group.MapPost("/tariffs", async (CreateCustomerTariffCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Billing.Manage);

        // Faturamento
        group.MapPost("/cycles/generate", async (GenerateBillingCycleCommand cmd, IMediator mediator) => await mediator.Send(cmd)).RequirePermission(Permissions.Billing.Manage);
    }
}