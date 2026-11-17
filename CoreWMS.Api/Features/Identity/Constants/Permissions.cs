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
        public const string View = "inventory:view";
        public const string Move = "inventory:move";
        public const string ManageQuality = "inventory:managequality";
        public const string EditTraceability = "inventory:edittraceability";
    }

    public static class Billing
    {
        public const string View = "billing:view";
        public const string Manage = "billing:manage";
    }

    public static class Inbound
    {
        // Consulta de ordens de recebimento, itens e progresso
        public const string View = "inbound:view";

        // Importação de arquivos XML e busca por chave de acesso
        public const string Import = "inbound:import";

        // Manifestação do Destinatário na SEFAZ (Confirmação, Desconhecimento, Não Realizada)
        public const string Manifest = "inbound:manifest";

        // Revisão e vínculo de produtos pendentes de cadastro na NF-e
        public const string Review = "inbound:review";

        // Cancelamento de ordens pendentes (antes do recebimento físico)
        public const string Cancel = "inbound:cancel";

        // Operação de conferência e geração de HUs no coletor
        public const string Receive = "inbound:receive";

        // Supervisão: estornos de HUs/ordens, importação legado e exclusão definitiva
        public const string Manage = "inbound:manage";
    }

    public static class Outbound
    {
        // Consulta de pedidos, detalhes, espelho fiscal e saldo disponível
        public const string View = "outbound:view";

        // Criação manual de pedidos de retorno/devolução
        public const string Create = "outbound:create";

        // Importação de pedidos via XML da NF-e
        public const string Import = "outbound:import";

        // Edição de cabeçalho do pedido (antes do picking)
        public const string Edit = "outbound:edit";

        // Cancelamento de pedidos
        public const string Cancel = "outbound:cancel";

        // Alocação automática e reserva manual de volumes/itens
        public const string Allocate = "outbound:allocate";

        // Separação física no coletor (Picking)
        public const string Pick = "outbound:pick";

        // Embalagem física no coletor (Packing)
        public const string Pack = "outbound:pack";

        // Conferência física de expedição (Checking)
        public const string Check = "outbound:check";

        // Baixa física e confirmação de expedição (Ship)
        public const string Ship = "outbound:ship";

        // Supervisão: estornos (picking/conferência/expedição) e exclusão definitiva
        public const string Manage = "outbound:manage";
    }

    public static class Yard
    {
        // Visualizar agenda e pátio (Todos / Operação)
        public const string View = "yard:view";

        // Check-in, Check-out e Encostar na Doca (Portaria / Encarregados)
        public const string Operate = "yard:operate";

        // Criar agendamentos, importar XML, cancelar e excluir (Gestão / Portaria)
        public const string Manage = "yard:manage";
    }
}