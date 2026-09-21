namespace CoreWMS.Api.Features.Quality;

public record QualityReasonDto(Guid Id, string Code, string Description, bool IsActive);
public record QualityImageDto(string FileName, string Base64Data);