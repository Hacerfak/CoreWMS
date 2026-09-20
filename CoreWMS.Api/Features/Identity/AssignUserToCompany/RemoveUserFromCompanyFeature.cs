using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request
public record RemoveUserAssignmentCommand(Guid UserId, Guid CompanyId) : IRequest<IResult>;

// 2. Handler
public class RemoveUserFromCompanyHandler : IRequestHandler<RemoveUserAssignmentCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public RemoveUserFromCompanyHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> Handle(RemoveUserAssignmentCommand request, CancellationToken ct)
    {
        var assignment = await _db.UserCompanyRoles
            .FirstOrDefaultAsync(x => x.UserId == request.UserId && x.CompanyId == request.CompanyId, ct);

        if (assignment == null)
            return Results.NotFound(new { Message = "Vínculo não encontrado." });

        _db.UserCompanyRoles.Remove(assignment);
        await _db.SaveChangesAsync(ct);

        // Invalida o cache para remover o acesso imediatamente
        _cacheService.InvalidateUserCompanyCache(request.UserId, request.CompanyId);

        return Results.NoContent();
    }
}

// 3. Endpoint
public static class RemoveUserFromCompanyEndpoints
{
    public static void MapRemoveUserFromCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapDelete("/api/users/{userId:guid}/companies/{companyId:guid}", async (Guid userId, Guid companyId, IMediator mediator) =>
            await mediator.Send(new RemoveUserAssignmentCommand(userId, companyId)))
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}