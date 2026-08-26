using CoreWMS.Api.Core.CQRS;

namespace CoreWMS.Api.Features.Identity.Login;

public record CompanyLoginDto(Guid Id, string Cnpj, string CorporateName);

public record LoginResponse(
    string Token,
    string RefreshToken,
    Guid UserId,
    string UserName,
    string Email,
    string Role,
    List<CompanyLoginDto> Companies
);

public record LoginCommand(string Email, string Password) : ICommand<IResult>;