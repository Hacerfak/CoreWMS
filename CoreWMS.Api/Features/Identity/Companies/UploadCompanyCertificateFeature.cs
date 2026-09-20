using System.Security.Cryptography.X509Certificates;
using CoreWMS.Api.Features.Identity.Constants;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace CoreWMS.Api.Features.Identity.Companies;

// 1. Request
public record UploadCertificateCommand(Guid Id, byte[] CertBytes, string Password) : IRequest<IResult>;

// 2. Handler
public class UploadCertificateHandler : IRequestHandler<UploadCertificateCommand, IResult>
{
    private readonly ApplicationDbContext _db;
    public UploadCertificateHandler(ApplicationDbContext db) => _db = db;

    public async Task<IResult> Handle(UploadCertificateCommand request, CancellationToken ct)
    {
        var company = await _db.Companies.FindAsync(new object[] { request.Id }, ct);
        if (company == null) return Results.NotFound(new { Message = "Empresa não encontrada." });

        using var cert = X509CertificateLoader.LoadPkcs12(request.CertBytes, request.Password, X509KeyStorageFlags.EphemeralKeySet);

        company.SetCertificate(request.CertBytes, CryptoService.Encrypt(request.Password), cert.NotAfter);

        await _db.SaveChangesAsync(ct);
        return Results.Ok(new { Expiration = cert.NotAfter });
    }
}

// 3. Endpoint
public static class UploadCompanyCertificateEndpoints
{
    public static void MapUploadCompanyCertificateEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPut("/api/companies/{id:guid}/certificate", async (Guid id, IFormFile certificateFile, [FromForm] string certificatePassword, IMediator mediator) =>
        {
            if (certificateFile == null || certificateFile.Length == 0)
                return Results.BadRequest(new { Message = "Certificado obrigatório." });

            using var ms = new MemoryStream();
            await certificateFile.CopyToAsync(ms);

            return await mediator.Send(new UploadCertificateCommand(id, ms.ToArray(), certificatePassword));
        })
        .WithTags("Companies")
        .RequireAuthorization()
        .RequirePermission(Permissions.Companies.Manage)
        .DisableAntiforgery();
    }
}