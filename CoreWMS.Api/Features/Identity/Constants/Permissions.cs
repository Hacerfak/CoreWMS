namespace CoreWMS.Api.Features.Identity.Constants;

public static class Permissions
{
    public static class Users
    {
        public const string View = "users:view";
        public const string Create = "users:create";
        public const string Edit = "users:edit";
        public const string Delete = "users:delete";
        public const string Assign = "users:assign";
    }

    public static class Roles
    {
        public const string View = "roles:view";
        public const string Create = "roles:create";
        public const string Edit = "roles:edit";
        public const string Delete = "roles:delete";
    }

    public static class Companies
    {
        public const string View = "companies:view";
        public const string Create = "companies:create";
        public const string Edit = "companies:edit";
        public const string Delete = "companies:delete";
    }

    public static class Profile
    {
        public const string UpdateSelf = "profile:update-self";
    }
}