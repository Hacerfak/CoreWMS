using System.Threading.Channels;

namespace CoreWMS.Api.Infrastructure.Audit;

public class AuditChannel
{
    private readonly Channel<AuditLog> _channel = Channel.CreateUnbounded<AuditLog>(new UnboundedChannelOptions
    {
        SingleReader = true
    });

    public ValueTask WriteAsync(AuditLog log, CancellationToken ct = default) => _channel.Writer.WriteAsync(log, ct);
    public IAsyncEnumerable<AuditLog> ReadAllAsync(CancellationToken ct = default) => _channel.Reader.ReadAllAsync(ct);
}