using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Identity.Roles;

// 1. Request / Response
public record CreateRoleCommand(string Name, List<string> Permissions) : IRequest<IResult>;
public record CreateRoleResponse(Guid Id, string Name, List<string> Permissions, DateTime CreatedAt);

// 2. Validator
public class CreateRoleCommandValidator : AbstractValidator<CreateRoleCommand>
{
    public CreateRoleCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome do perfil é obrigatório.").MaximumLength(100);
        RuleFor(x => x.Permissions).NotNull().WithMessage("A lista de permissões não pode ser nula.");
    }
}

// 3. Handler
public class CreateRoleHandler : IRequestHandler<CreateRoleCommand, IResult>
{
    private readonly ApplicationDbContext _db;

    public CreateRoleHandler(ApplicationDbContext db)
    {
        _db = db;
    }

    public async Task<IResult> Handle(CreateRoleCommand request, CancellationToken ct)
    {
        if (await _db.Roles.AnyAsync(r => r.Name == request.Name, ct))
            return Results.BadRequest(new { Message = "Já existe um perfil com este nome." });

        var role = new Role(request.Name);

        foreach (var p in request.Permissions)
        {
            role.AddPermission(p); // Chamada do método de domínio
        }

        _db.Roles.Add(role);
        await _db.SaveChangesAsync(ct);

        var response = new CreateRoleResponse(role.Id, role.Name, role.Permissions.Select(x => x.Permission).ToList(), role.CreatedAt);
        return Results.Created($"/api/roles/{role.Id}", response);
    }
}

// 4. Endpoint
public static class CreateRoleEndpoint
{
    public static void MapCreateRoleEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/roles", async (CreateRoleCommand cmd, IMediator mediator) => await mediator.Send(cmd))
           .WithTags("Roles")
           .RequireAuthorization()
           .RequirePermission(Permissions.Roles.Manage);
    }
}