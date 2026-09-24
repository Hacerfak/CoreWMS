using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Identity.Companies;

public record UpdateCompanyCommand(
    Guid Id, string CorporateName, string? TradeName, string? StateRegistration,
    string? Cnae, int Crt, int Environment, int NfeSerie, int NfeNextNumber, string? Rntrc,
    string? MunicipalRegistration, string? Iest, string? Email, string? Phone,
    string? ZipCode, string? Street, string? Number, string? Complement, string? Neighborhood, string? CityName, int CityCode, string State,
    string? LogoBase64) : IRequest<IResult>;

public class UpdateCompanyCommandValidator : AbstractValidator<UpdateCompanyCommand>
{
    public UpdateCompanyCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().Length(2);
        RuleFor(x => x.Environment).InclusiveBetween(1, 2);
        RuleFor(x => x.NfeSerie).GreaterThanOrEqualTo(1).WithMessage("A série da NF-e deve ser maior ou igual a 1.");
        RuleFor(x => x.NfeNextNumber).GreaterThanOrEqualTo(1).WithMessage("O número sequencial da NF-e deve ser maior ou igual a 1.");
    }
}

public class UpdateCompanyHandler : IRequestHandler<UpdateCompanyCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UpdateCompanyHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UpdateCompanyCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        company.UpdateDetails(
            request.CorporateName, request.TradeName, request.StateRegistration,
            request.Cnae, request.Crt, request.MunicipalRegistration, request.Iest,
            request.Email, request.Phone,
            request.ZipCode, request.Street, request.Number, request.Complement, request.Neighborhood, request.CityName, request.CityCode, request.State,
            request.LogoBase64);

        company.UpdateEnvironment(request.Environment);
        company.UpdateNfeAndTransportDetails(request.NfeSerie, request.NfeNextNumber, request.Rntrc);

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

public static class UpdateCompanyEndpoints
{
    public static void MapUpdateCompanyEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/companies/{id:guid}", async (Guid id, UpdateCompanyCommand cmd, IMediator mediator) =>
            await mediator.Send(cmd with { Id = id }))
            .WithTags("Companies")
            .RequireAuthorization()
            .RequirePermission(Permissions.Companies.Manage);
    }
}