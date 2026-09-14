namespace CoreWMS.Api.Features.Identity.Constants;

public static class Permissions
{
    public static class Users
    {
        public const string Manage = "users:manage";
    }

    public static class Roles
    {
        public const string Manage = "roles:manage";
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

    public static class Topology
    {
        public const string Manage = "topology:manage";
    }

    public static class Products
    {
        public const string View = "products:view";
        public const string Create = "products:create";
        public const string Edit = "products:edit";
        public const string Delete = "products:delete";
    }

    public static class Inventory
    {
        public const string View = "Permissions.Inventory.View";
        public const string Move = "Permissions.Inventory.Move";
        public const string ManageQuality = "Permissions.Inventory.ManageQuality";
        public const string EditTraceability = "Permissions.Inventory.EditTraceability";
    }

    public static class Billing
    {
        public const string View = "Permissions.Billing.View";
        public const string Manage = "Permissions.Billing.Manage";
    }

    public static class Inbound
    {
        // Visualização da tela de Inbound e acompanhamento do progresso (Todos)
        public const string View = "inbound:view";

        // Importação de arquivos XML (Gestão/Administração)
        public const string Import = "inbound:import";

        // Revisão de pré-cadastros de produtos gerados pelo XML (Gestão)
        public const string Review = "inbound:review";

        // Ação de bipar, conferir e dar checkout no carrinho gerando HUs (Operação/Gestão)
        public const string Receive = "inbound:receive";

        // Cancelamento de ordens, forçar fechamento com falta, estornos (Administração/Gestão)
        public const string Manage = "inbound:manage";
    }
}