using CoreWMS.Api.Core.CQRS;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Audit;
using CoreWMS.Api.Infrastructure.Security;
using Microsoft.AspNetCore.Mvc;
using MongoDB.Driver;

namespace CoreWMS.Api.Features.Audit;

// ==============================================================================
// 1. CONTRATOS & DTOs
// ==============================================================================
public record AuditLogFilterQuery(
    string? EntityName,
    string? EntityId,
    string? UserId,
    DateTime? StartDate,
    DateTime? EndDate,
    int Page = 1,
    int PageSize = 20
) : IQuery<IResult>;

public record PaginatedResult<T>(List<T> Items, long TotalCount, int Page, int PageSize);

// ==============================================================================
// 2. HANDLER
// ==============================================================================
public class ListAuditLogsHandler : IQueryHandler<AuditLogFilterQuery, IResult>
{
    private readonly IMongoCollection<AuditLog> _auditCollection;

    public ListAuditLogsHandler(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MongoDb");
        var client = new MongoClient(connectionString);
        var database = client.GetDatabase("corewms_audit");
        _auditCollection = database.GetCollection<AuditLog>("audit_logs");
    }

    public async Task<IResult> HandleAsync(AuditLogFilterQuery query, CancellationToken ct = default)
    {
        var builder = Builders<AuditLog>.Filter;
        var filter = builder.Empty;

        if (!string.IsNullOrWhiteSpace(query.EntityName))
            filter &= builder.Eq(x => x.EntityName, query.EntityName);

        if (!string.IsNullOrWhiteSpace(query.EntityId))
            filter &= builder.Eq(x => x.EntityId, query.EntityId);

        if (!string.IsNullOrWhiteSpace(query.UserId))
            filter &= builder.Eq(x => x.UserId, query.UserId);

        if (query.StartDate.HasValue)
            filter &= builder.Gte(x => x.Timestamp, query.StartDate.Value.ToUniversalTime());

        if (query.EndDate.HasValue)
            filter &= builder.Lte(x => x.Timestamp, query.EndDate.Value.ToUniversalTime());

        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize is < 1 or > 100 ? 20 : query.PageSize;
        var skip = (page - 1) * pageSize;

        var totalTask = _auditCollection.CountDocumentsAsync(filter, cancellationToken: ct);
        var itemsTask = _auditCollection
            .Find(filter)
            .SortByDescending(x => x.Timestamp)
            .Skip(skip)
            .Limit(pageSize)
            .ToListAsync(ct);

        await Task.WhenAll(totalTask, itemsTask);

        var response = new PaginatedResult<AuditLog>(
            Items: itemsTask.Result,
            TotalCount: totalTask.Result,
            Page: page,
            PageSize: pageSize
        );

        return Results.Ok(response);
    }
}

// ==============================================================================
// 3. ENDPOINT
// ==============================================================================
public static class AuditLogEndpoints
{
    public static void MapAuditLogEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/audit-logs", async (
            [AsParameters] AuditLogFilterQuery query,
            [FromServices] IQueryHandler<AuditLogFilterQuery, IResult> handler,
            CancellationToken ct) => await handler.HandleAsync(query, ct))
            .WithTags("Audit")
            .RequireAuthorization()
            .RequirePermission(Permissions.Audit.View);
    }
}