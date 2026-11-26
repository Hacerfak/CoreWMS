using System.Text.Json;

namespace CoreWMS.PrintAgent.Services;

public class AgentConfig
{
    public string AgentId { get; set; } = "EXPEDICAO_01";
    public string Dominio { get; set; } = "localhost:5000";
    public string ApiKey { get; set; } = "";
    public int LocalPort { get; set; } = 9191;

    public string ServerUrl
    {
        get
        {
            var raw = (Dominio ?? string.Empty).Trim().TrimEnd('/');
            if (string.IsNullOrWhiteSpace(raw))
                return string.Empty;

            if (raw.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                raw.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return $"{raw}/hubs/print";
            }

            var isLocalHost = raw.StartsWith("localhost", StringComparison.OrdinalIgnoreCase) ||
                              raw.StartsWith("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                              raw.StartsWith("[::1]", StringComparison.OrdinalIgnoreCase);

            var scheme = isLocalHost ? "http" : "https";
            return $"{scheme}://{raw}/hubs/print";
        }
    }
}

public class AgentConfigManager
{
    private readonly string _configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agentconfig.json");
    public AgentConfig Config { get; private set; }

    public AgentConfigManager()
    {
        Config = Load();
    }

    public AgentConfig Load()
    {
        if (!File.Exists(_configPath))
        {
            var initial = new AgentConfig();
            Save(initial);
            return initial;
        }

        try
        {
            var json = File.ReadAllText(_configPath);
            return JsonSerializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
        }
        catch
        {
            return new AgentConfig();
        }
    }

    public void Save(AgentConfig config)
    {
        Config = config;
        var json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(_configPath, json);
    }
}