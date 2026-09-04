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

    public static class Inbound
    {
        // ==========================================
        // VISUALIZAÇÃO E DADOS SENSÍVEIS
        // ==========================================
        public const string View = "inbound:view"; // Permite acessar a tela unificada e ver a lista.
        public const string ViewFinancials = "inbound:view_financials"; // Ver valores em R$ da NF-e.
        public const string ViewExpectedQty = "inbound:view_expected_qty"; // Ver quantidade da NF-e (Sem isso, o sistema força Conferência Cega).

        // ==========================================
        // BACKOFFICE E PREPARAÇÃO
        // ==========================================
        public const string UploadXml = "inbound:upload_xml"; // Fazer upload do XML da SEFAZ.
        public const string ReviewProducts = "inbound:review_products"; // Vincular produtos do XML ("Malha Fina") ao catálogo do WMS.

        // ==========================================
        // OPERAÇÃO NO CHÃO DE FÁBRICA
        // ==========================================
        public const string AssignDock = "inbound:assign_dock"; // Atribuir/Trocar doca de recebimento.
        public const string ExecuteChecking = "inbound:execute_checking"; // Iniciar processo e bipar HUs/Produtos.
        public const string ExecutePutaway = "inbound:execute_putaway"; // Movimentar as HUs recebidas da Doca para o Estoque Físico.

        // ==========================================
        // AÇÕES GERENCIAIS E CRÍTICAS
        // ==========================================
        public const string ManageDivergences = "inbound:manage_divergences"; // Aceitar faltas/sobras e aprovar divergências.
        public const string ForceFinish = "inbound:force_finish"; // Encerrar o recebimento manualmente (forçar fechamento).
        public const string Cancel = "inbound:cancel"; // Estornar/Cancelar ordem de recebimento.
    }
}