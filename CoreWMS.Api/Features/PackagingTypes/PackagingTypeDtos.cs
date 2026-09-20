namespace CoreWMS.Api.Features.PackagingTypes;

public record PackagingTypeDto(Guid Id, string Code, string Description, bool IsActive);