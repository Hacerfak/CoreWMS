using CoreWMS.Api.Core.CQRS;

namespace CoreWMS.Api.Features.Identity.Login;

public static class LoginEndpoint
{
    public static void MapLoginEndpoint(this IEndpointRouteBuilder app)
    {
        // Injetamos o Handler diretamente no endpoint
        app.MapPost("/api/identity/login", async (
            LoginCommand command,
            ICommandHandler<LoginCommand, IResult> handler,
            CancellationToken ct) =>
        {
            return await handler.HandleAsync(command, ct);
        })
        .WithTags("Identity")
        .AllowAnonymous();
    }
}