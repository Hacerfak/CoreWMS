namespace CoreWMS.Api.Features.Identity.Users;

public record UserAssignmentDto(Guid CompanyId, string CompanyName, string RoleName);
public record UserDto(Guid Id, string Name, string Email, bool IsMaster, DateTime CreatedAt, List<UserAssignmentDto> Assignments);