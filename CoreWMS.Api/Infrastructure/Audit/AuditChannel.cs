using System.Threading.Channels;

namespace CoreWMS.Api.Infrastructure.Audit;

public class AuditChannel
{
    private readonly Channel<AuditLog> _channel;

    public ChannelReader<AuditLog> Reader => _channel.Reader;

    public AuditChannel()
    {
        // Capacidade para 50.000 logs em memória (evita que o servidor caia se o Mongo ficar offline)
        var options = new BoundedChannelOptions(50000)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true
        };

        _channel = Channel.CreateBounded<AuditLog>(options);
    }

    public ValueTask WriteAsync(AuditLog log, CancellationToken ct = default)
    {
        return _channel.Writer.WriteAsync(log, ct);
    }
}