using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Roles;

// 1. Request
public record UpdateRoleRequest(string Name, List<string> Permissions);
public record UpdateRoleCommand(Guid Id, string Name, List<string> Permissions) : IRequest<IResult>;

// 2. Validator
public class UpdateRoleCommandValidator : AbstractValidator<UpdateRoleCommand>
{
    public UpdateRoleCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome do perfil é obrigatório.").MaximumLength(100);
        RuleFor(x => x.Permissions).NotNull().WithMessage("A lista de permissões não pode ser nula.");
    }
}

// 3. Handler
public class UpdateRoleHandler : IRequestHandler<UpdateRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    private readonly IPermissionCacheService _cacheService;

    public UpdateRoleHandler(ApplicationDbContext db, IPermissionCacheService cacheService)
    {
        _db = db;
        _cacheService = cacheService;
    }

    public async Task<IResult> Handle(UpdateRoleCommand request, CancellationToken ct)
    {
        // 1. Carrega APENAS a Role (Sem .Include para manter o Change Tracker leve e não bugar coleções)
        var role = await _db.Roles.FirstOrDefaultAsync(r => r.Id == request.Id, ct);

        if (role == null)
            return Results.NotFound(new { Message = "Perfil não encontrado." });

        if (await _db.Roles.AnyAsync(r => r.Name == request.Name && r.Id != request.Id, ct))
            return Results.BadRequest(new { Message = "Já existe outro perfil com este nome." });

        role.UpdateName(request.Name);

        // 2. Sincronização explícita: Busca as permissões diretamente do banco
        var currentPermissions = await _db.RolePermissions
            .Where(rp => rp.RoleId == role.Id)
            .ToListAsync(ct);

        // 3. Remove o que foi desmarcado na tela
        var toRemove = currentPermissions
            .Where(p => !request.Permissions.Contains(p.Permission))
            .ToList();

        if (toRemove.Any())
        {
            _db.RolePermissions.RemoveRange(toRemove);
        }

        // 4. Adiciona apenas as opções novas que foram marcadas
        var currentNames = currentPermissions.Select(p => p.Permission).ToList();
        var toAdd = request.Permissions
            .Where(p => !currentNames.Contains(p))
            .Select(p => new RolePermission(role.Id, p))
            .ToList();

        if (toAdd.Any())
        {
            _db.RolePermissions.AddRange(toAdd);
        }

        // NOVO: Força o EF Core a entender que o Perfil (Aggregate Root) foi modificado.
        // Isso vai disparar o gatilho do seu AuditableEntity e jogar o log no MongoDB!
        _db.Entry(role).State = EntityState.Modified;

        // 5. Agora o EF Core dispara as querys exatas de DELETE e INSERT sem se perder!
        await _db.SaveChangesAsync(ct);

        // Força todos os usuários a revalidarem as permissões instantaneamente
        _cacheService.InvalidateUserAllCompaniesCache(Guid.Empty);

        return Results.NoContent();
    }
}

// 4. Endpoint
public static class UpdateRoleEndpoints
{
    public static void MapUpdateRoleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/roles/{id:guid}", async (Guid id, UpdateRoleRequest req, IMediator mediator) =>
            await mediator.Send(new UpdateRoleCommand(id, req.Name, req.Permissions)))
           .WithTags("Roles")
           .RequireAuthorization()
           .RequirePermission(Permissions.Roles.Manage);
    }
}