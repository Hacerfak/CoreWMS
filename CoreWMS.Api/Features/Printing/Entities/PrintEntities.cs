using CoreWMS.Api.Core.Entities;
using CoreWMS.Api.Features.Printing.Enums;

namespace CoreWMS.Api.Features.Printing.Entities;

public class PrintAgent : AuditableEntity
{
    public string Name { get; private set; } = null!;
    public string ApiKey { get; private set; } = null!;
    public bool IsActive { get; private set; } = true;
    public ICollection<Printer> Printers { get; private set; } = new List<Printer>();

    protected PrintAgent() { }

    public PrintAgent(string name, string apiKey)
    {
        Name = name;
        ApiKey = apiKey;
    }

    public void Update(string name, bool isActive)
    {
        Name = name;
        IsActive = isActive;
    }

    public void RegenerateApiKey(string newApiKey)
    {
        ApiKey = newApiKey;
    }
}

public class Printer : AuditableEntity
{
    public Guid PrintAgentId { get; private set; }
    public PrintAgent PrintAgent { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public string Target { get; private set; } = null!; // Ex: "192.168.1.150:9100" ou "USB_Zebra"
    public bool IsActive { get; private set; } = true;

    protected Printer() { }

    public Printer(Guid printAgentId, string name, string target)
    {
        PrintAgentId = printAgentId;
        Name = name;
        Target = target;
    }

    public void Update(string name, string target, bool isActive)
    {
        Name = name;
        Target = target;
        IsActive = isActive;
    }
}

public class LabelTemplate : AuditableEntity
{
    public string Name { get; private set; } = null!;
    public PrintTemplatePurpose Purpose { get; private set; } // NOVO
    public string ZplContent { get; private set; } = null!;
    public int WidthMm { get; private set; }
    public int HeightMm { get; private set; }
    public bool IsActive { get; private set; } = true;

    protected LabelTemplate() { }

    public LabelTemplate(string name, PrintTemplatePurpose purpose, string zplContent, int widthMm, int heightMm)
    {
        Name = name;
        Purpose = purpose;
        ZplContent = zplContent;
        WidthMm = widthMm;
        HeightMm = heightMm;
    }

    public void Update(string name, PrintTemplatePurpose purpose, string zplContent, int widthMm, int heightMm, bool isActive)
    {
        Name = name;
        Purpose = purpose;
        ZplContent = zplContent;
        WidthMm = widthMm;
        HeightMm = heightMm;
        IsActive = isActive;
    }
}