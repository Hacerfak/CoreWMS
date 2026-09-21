using System.Threading.Channels;
using CoreWMS.Api.Features.Inventory.Entities;

namespace CoreWMS.Api.Infrastructure.Services.Inventory;

public class KardexChannel
{
    private readonly Channel<InventoryTransaction> _channel;

    public ChannelReader<InventoryTransaction> Reader => _channel.Reader;

    public KardexChannel()
    {
        var options = new BoundedChannelOptions(20000)
        {
            FullMode = BoundedChannelFullMode.Wait
        };

        _channel = Channel.CreateBounded<InventoryTransaction>(options);
    }

    public async ValueTask WriteAsync(InventoryTransaction transaction, CancellationToken ct = default)
    {
        await _channel.Writer.WriteAsync(transaction, ct);
    }
}