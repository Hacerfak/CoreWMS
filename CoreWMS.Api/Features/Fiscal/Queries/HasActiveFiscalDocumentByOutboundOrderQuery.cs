using System;
using System.Threading;
using System.Threading.Tasks;
using CoreWMS.Api.Features.Fiscal.Entities;
using CoreWMS.Api.Infrastructure.Data;
using CoreWMS.Api.Infrastructure.Security;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace CoreWMS.Api.Features.Fiscal.Queries;

public record HasActiveFiscalDocumentByOutboundOrderQuery(Guid OutboundOrderId) : IRequest<bool>;

public class HasActiveFiscalDocumentByOutboundOrderHandler : IRequestHandler<HasActiveFiscalDocumentByOutboundOrderQuery, bool>
{
    private readonly ApplicationDbContext _db;
    private readonly ITenantProvider _tenant;

    public HasActiveFiscalDocumentByOutboundOrderHandler(ApplicationDbContext db, ITenantProvider tenant)
    {
        _db = db;
        _tenant = tenant;
    }

    public async Task<bool> Handle(HasActiveFiscalDocumentByOutboundOrderQuery request, CancellationToken ct)
    {
        var companyId = _tenant.GetCompanyId();

        // Verifica documentos fiscais ativos (tipos de NF-e 1 a 6) autorizados para a ordem
        return await _db.CompanyFiscalDocuments
            .AsNoTracking()
            .AnyAsync(d => d.CompanyId == companyId
                        && d.OutboundOrderId == request.OutboundOrderId
                        && (int)d.Type >= 1 && (int)d.Type <= 6
                        && d.Status == FiscalDocumentStatus.Authorized, ct);
    }
}