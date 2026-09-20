using CoreWMS.Api.Core.Models;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using MongoDB.Driver;

namespace CoreWMS.Api.Features.Audit;

// 1. Request
public record AuditLogFilterQuery(string? EntityName, string? EntityId, string? UserId, DateTime? StartDate, DateTime? EndDate, int Page = 1, int PageSize = 20) : IRequest<IResult>;

// 2. Validator
public class AuditLogFilterQueryValidator : AbstractValidator<AuditLogFilterQuery>
{
    public AuditLogFilterQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100).WithMessage("O tamanho da página deve ser entre 1 e 100.");
    }
}

// 3. Handler
public class ListAuditLogsHandler : IRequestHandler<AuditLogFilterQuery, IResult>
{
    private readonly IMongoCollection<AuditLog> _auditCollection;

    // A injeção agora espera o IMongoClient, que deve ser Singleton!
    public ListAuditLogsHandler(IMongoClient mongoClient)
    {
        _auditCollection = mongoClient.GetDatabase("corewms_audit").GetCollection<AuditLog>("audit_logs");
    }

    public async Task<IResult> Handle(AuditLogFilterQuery request, CancellationToken ct)
    {
        var builder = Builders<AuditLog>.Filter;
        var filter = builder.Empty;

        if (!string.IsNullOrWhiteSpace(request.EntityName))
            filter &= builder.Regex(x => x.EntityName, new MongoDB.Bson.BsonRegularExpression(request.EntityName, "i"));

        if (!string.IsNullOrWhiteSpace(request.EntityId))
            filter &= builder.Eq(x => x.EntityId, request.EntityId);

        if (!string.IsNullOrWhiteSpace(request.UserId))
            filter &= builder.Eq(x => x.UserId, request.UserId);

        if (request.StartDate.HasValue)
            filter &= builder.Gte(x => x.Timestamp, request.StartDate.Value.ToUniversalTime());

        if (request.EndDate.HasValue)
            filter &= builder.Lte(x => x.Timestamp, request.EndDate.Value.ToUniversalTime());

        var skip = (request.Page - 1) * request.PageSize;

        var totalTask = _auditCollection.CountDocumentsAsync(filter, cancellationToken: ct);

        var itemsTask = _auditCollection.Find(filter)
            .SortByDescending(x => x.Timestamp)
            .Skip(skip)
            .Limit(request.PageSize)
            .ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        // Usando o PaginatedResult base do Core
        var response = new PaginatedResult<AuditLog>(itemsTask.Result, (int)totalTask.Result, request.Page, request.PageSize);

        return Results.Ok(response);
    }
}

// 4. Endpoint
public static class ListAuditLogsEndpoints
{
    public static void MapListAuditLogsEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/audit-logs", async ([AsParameters] AuditLogFilterQuery query, IMediator mediator) =>
            await mediator.Send(query))
        .WithTags("Audit")
        .RequireAuthorization()
        .RequirePermission(Permissions.Audit.View);
    }
}