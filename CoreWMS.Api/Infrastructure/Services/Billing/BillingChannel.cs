using System.Threading.Channels;

namespace CoreWMS.Api.Infrastructure.Services.Billing;

public record BillingRecalculationTask(
    Guid CompanyId,
    Guid CustomerId,
    DateTime ReferenceDate,
    Guid? TriggerOrderId = null,
    string? TriggerType = null
);

public class BillingChannel
{
    private readonly Channel<BillingRecalculationTask> _channel;

    public BillingChannel()
    {
        var options = new BoundedChannelOptions(500)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
            SingleWriter = false
        };
        _channel = Channel.CreateBounded<BillingRecalculationTask>(options);
    }

    public async ValueTask EnqueueRecalculationAsync(BillingRecalculationTask task, CancellationToken ct = default)
    {
        await _channel.Writer.WriteAsync(task, ct);
    }

    public IAsyncEnumerable<BillingRecalculationTask> ReadAllAsync(CancellationToken ct = default)
    {
        return _channel.Reader.ReadAllAsync(ct);
    }
}