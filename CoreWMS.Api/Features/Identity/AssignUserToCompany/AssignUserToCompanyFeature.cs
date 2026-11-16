using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Users;

public record AssignUserRequest(Guid CompanyId, Guid RoleId, List<Guid>? AllowedCustomerIds);
public record AssignUserCommand(Guid UserId, Guid CompanyId, Guid RoleId, List<Guid>? AllowedCustomerIds) : IRequest<IResult>;

public class AssignUserCommandValidator : AbstractValidator<AssignUserCommand>
{
    public AssignUserCommandValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();
        RuleFor(x => x.CompanyId).NotEmpty().WithMessage("A Empresa é obrigatória.");
        RuleFor(x => x.RoleId).NotEmpty().WithMessage("O Perfil é obrigatório.");
    }
}

public class AssignUserToCompanyHandler : IRequestHandler<AssignUserCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public AssignUserToCompanyHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> Handle(AssignUserCommand request, CancellationToken ct)
    {
        if (!await _db.Users.AnyAsync(u => u.Id == request.UserId, ct))
            return Results.NotFound(new { Message = "Usuário não encontrado." });

        if (!await _db.Companies.AnyAsync(c => c.Id == request.CompanyId, ct))
            return Results.BadRequest(new { Message = "Empresa não existe." });

        if (!await _db.Roles.AnyAsync(r => r.Id == request.RoleId, ct))
            return Results.BadRequest(new { Message = "Perfil não existe." });

        if (request.AllowedCustomerIds != null && request.AllowedCustomerIds.Any())
        {
            var validCount = await _db.Customers
                .CountAsync(c => c.CompanyId == request.CompanyId && request.AllowedCustomerIds.Contains(c.Id), ct);

            if (validCount != request.AllowedCustomerIds.Count)
                return Results.BadRequest(new { Message = "Um ou mais depositantes informados são inválidos ou não pertencem a esta empresa." });
        }

        var existingAssignment = await _db.UserCompanyRoles
            .FirstOrDefaultAsync(x => x.UserId == request.UserId && x.CompanyId == request.CompanyId, ct);

        if (existingAssignment != null)
        {
            _db.UserCompanyRoles.Remove(existingAssignment);
        }

        _db.UserCompanyRoles.Add(new UserCompanyRole(request.UserId, request.CompanyId, request.RoleId));

        var currentCustomers = await _db.Set<UserCustomer>()
            .Include(uc => uc.Customer)
            .Where(uc => uc.UserId == request.UserId && uc.Customer.CompanyId == request.CompanyId)
            .ToListAsync(ct);

        if (currentCustomers.Any())
        {
            _db.Set<UserCustomer>().RemoveRange(currentCustomers);
        }

        if (request.AllowedCustomerIds != null && request.AllowedCustomerIds.Any())
        {
            var newCustomerLinks = request.AllowedCustomerIds
                .Distinct()
                .Select(customerId => new UserCustomer(request.UserId, customerId))
                .ToList();

            _db.Set<UserCustomer>().AddRange(newCustomerLinks);
        }

        await _db.SaveChangesAsync(ct);
        _cacheService.InvalidateUserCompanyCache(request.UserId, request.CompanyId);

        return Results.Ok(new
        {
            Message = existingAssignment != null
                ? "Vínculo de empresa, perfil e depositantes atualizado com sucesso!"
                : "Usuário vinculado à empresa com sucesso!"
        });
    }
}

public static class AssignUserToCompanyEndpoints
{
    public static void MapAssignUserToCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/users/{userId:guid}/companies", async (Guid userId, AssignUserRequest req, IMediator mediator) =>
            await mediator.Send(new AssignUserCommand(userId, req.CompanyId, req.RoleId, req.AllowedCustomerIds)))
            .WithTags("Users")
            .RequireAuthorization()
            .RequirePermission(Permissions.Users.Manage);
    }
}