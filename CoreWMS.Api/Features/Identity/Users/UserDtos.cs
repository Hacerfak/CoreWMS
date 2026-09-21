namespace CoreWMS.Api.Features.Identity.Users;

// Atualizado para enviar os CustomerIds restritos para a UI
public record UserAssignmentDto(Guid CompanyId, string CompanyName, string RoleName, List<Guid> AllowedCustomerIds);

public record UserDto(Guid Id, string Name, string Email, bool IsMaster, DateTime CreatedAt, List<UserAssignmentDto> Assignments);