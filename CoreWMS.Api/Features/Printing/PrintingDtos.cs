namespace CoreWMS.Api.Features.Printing;

public record PrinterResponseDto(Guid Id, string Name, string Target, bool IsActive);
public record PrintAgentResponseDto(Guid Id, string Name, string ApiKey, bool IsActive, bool IsOnline, List<PrinterResponseDto> Printers);
public record TemplateResponseDto(Guid Id, string Name, string ZplContent, int WidthMm, int HeightMm, bool IsActive);