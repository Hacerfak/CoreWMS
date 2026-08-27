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
        public const string Manage = "companies:manage";
    }

    public static class Customers
    {
        public const string View = "customers:view";
        public const string Create = "customers:create";
        public const string Edit = "customers:edit";
        public const string Delete = "customers:delete";
    }

    public static class Profile
    {
        public const string UpdateSelf = "profile:update-self";
    }

    public static class Audit
    {
        public const string View = "audit:view";
    }

    public static class Printing
    {
        public const string Manage = "printing:manage";
    }
}