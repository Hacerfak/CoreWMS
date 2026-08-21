using System.Collections.Concurrent;
using System.Text;

namespace CoreWMS.PrintAgent.Services;

public class InMemoryLogBuffer : ILoggerProvider
{
    private readonly ConcurrentQueue<string> _logs = new();
    private const int MaxLines = 100;

    public void AddLog(string message)
    {
        var line = $"[{DateTime.Now:HH:mm:ss}] {message}";
        _logs.Enqueue(line);

        while (_logs.Count > MaxLines)
        {
            _logs.TryDequeue(out _);
        }
    }

    public string GetLogsText()
    {
        var sb = new StringBuilder();
        foreach (var log in _logs)
        {
            sb.AppendLine(log);
        }
        return sb.Length > 0 ? sb.ToString() : "Aguardando logs do sistema...";
    }

    public ILogger CreateLogger(string categoryName) => new BufferLogger(this, categoryName);
    public void Dispose() { }

    private class BufferLogger : ILogger
    {
        private readonly InMemoryLogBuffer _buffer;
        private readonly string _categoryName;

        public BufferLogger(InMemoryLogBuffer buffer, string categoryName)
        {
            _buffer = buffer;
            _categoryName = categoryName;
        }

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => logLevel >= LogLevel.Information;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            if (!IsEnabled(logLevel)) return;

            // 1. Ignora os logs internos do framework HTTP do ASP.NET Core
            if (_categoryName.StartsWith("Microsoft.AspNetCore")) return;

            var message = formatter(state, exception);

            // 2. Ignora requisições das rotas de polling do dashboard
            if (message.Contains("/status-data") || message.Contains("/logs-data")) return;

            _buffer.AddLog(message);
        }
    }
}