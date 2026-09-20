using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using FluentValidation;
using MediatR;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request
public record UpdateCompanyCommand(
    Guid Id, string CorporateName, string? TradeName, string? StateRegistration,
    string? Cnae, int Crt, string? MunicipalRegistration, string? Iest,
    string? Email, string? Phone,
    string? ZipCode, string? Street, string? Number, string? Complement, string? Neighborhood, string? CityName, int CityCode, string State,
    string? LogoBase64) : IRequest<IResult>;

// 2. Validator
public class UpdateCompanyCommandValidator : AbstractValidator<UpdateCompanyCommand>
{
    public UpdateCompanyCommandValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CorporateName).NotEmpty().MaximumLength(150);
        RuleFor(x => x.State).NotEmpty().Length(2);
    }
}

// 3. Handler
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

        await _db.SaveChangesAsync(ct);
        return Results.NoContent();
    }
}

// 4. Endpoint
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