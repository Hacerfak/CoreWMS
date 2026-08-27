using System.Collections.Concurrent;

namespace CoreWMS.Api.Infrastructure.Printing;

public interface IPrintConnectionManager
{
    void AddConnection(string connectionId, string apiKey);
    void RemoveConnection(string connectionId);
    bool IsOnline(string apiKey);
}

public class PrintConnectionManager : IPrintConnectionManager
{
    // Guarda: ConnectionId -> ApiKey
    private readonly ConcurrentDictionary<string, string> _connections = new();

    public void AddConnection(string connectionId, string apiKey)
    {
        _connections.TryAdd(connectionId, apiKey);
    }

    public void RemoveConnection(string connectionId)
    {
        _connections.TryRemove(connectionId, out _);
    }

    public bool IsOnline(string apiKey)
    {
        return _connections.Values.Contains(apiKey);
    }
}