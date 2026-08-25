using CoreWMS.Api.Core.CQRS;

namespace CoreWMS.Api.Features.Identity.Login;

// DTO para trafegar os dados da empresa no Login
public record CompanyLoginDto(Guid Id, string Cnpj, string Name);

// Adicione a string do RefreshToken na resposta
public record LoginResponse(string AccessToken, string RefreshToken, string Name, bool IsMaster, List<CompanyLoginDto> Companies);

// Nosso Request de entrada
public record LoginCommand(string Email, string Password) : ICommand<IResult>;