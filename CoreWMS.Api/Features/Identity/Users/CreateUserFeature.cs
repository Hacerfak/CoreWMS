using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Features.Identity.Entities;
using CoreWMS.Api.Infrastructure.Data;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CoreWMS.Api.Infrastructure.Security;

namespace CoreWMS.Api.Features.Identity.Users;

// 1. Request / Response
public record CreateUserCommand(string Name, string Email, string Password) : IRequest<UserDto>;

// 2. Validator
public class CreateUserCommandValidator : AbstractValidator<CreateUserCommand>
{
    public CreateUserCommandValidator()
    {
        RuleFor(x => x.Name).NotEmpty().WithMessage("O nome é obrigatório.").MaximumLength(150);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().WithMessage("Informe um e-mail válido.");
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6).WithMessage("A senha deve ter no mínimo 6 caracteres.");
    }
}

// 3. Handler
public class CreateUserHandler : IRequestHandler<CreateUserCommand, UserDto>
{
    private readonly ApplicationDbContext _db;
    public CreateUserHandler(ApplicationDbContext db) => _db = db;

    public async Task<UserDto> Handle(CreateUserCommand request, CancellationToken ct)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email, ct))
            throw new InvalidOperationException("E-mail já em uso.");

        var user = new User(request.Name, request.Email, BCrypt.Net.BCrypt.HashPassword(request.Password), false);
        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);

        return new UserDto(user.Id, user.Name, user.Email, user.IsMaster, user.CreatedAt, new List<UserAssignmentDto>());
    }
}

// 4. Endpoint
public static class CreateUserEndpoint
{
    public static void MapCreateUserEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/users", async (CreateUserCommand cmd, IMediator mediator) =>
        {
            var result = await mediator.Send(cmd);
            return Results.Created($"/api/users/{result.Id}", result);
        })
        .WithTags("Users")
        .RequireAuthorization()
        .RequirePermission(Permissions.Users.Manage);
    }
}