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
        // Consulta de balanço, unidades de manuseio (HUs) e extrato Kardex
        public const string View = "inventory:view";

        // Exportação de relatórios CSV (Balanço, HUs e Kardex)
        public const string Export = "inventory:export";

        // Sugestão de guarda (Putaway) e movimentação física entre endereços
        public const string Move = "inventory:move";

        // Transbordo / desmembramento de HUs (Split)
        public const string Split = "inventory:split";

        // Agrupamento / consolidação de HUs (Merge)
        public const string Merge = "inventory:merge";

        // Edição de lote, validade, série, embalagem e pesos (Individual e Lote)
        public const string EditTraceability = "inventory:edittraceability";

        // Supervisão: estornos diretos de saldo, Kardex e reservas
        public const string Manage = "inventory:manage";
    }

    public static class Quality
    {
        // Consulta de ocorrências de qualidade, histórico da HU e motivos
        public const string View = "quality:view";

        // Apontamento de avaria, quarentena, divergências, faltas e sobras (Operação e Gestão)
        public const string Hold = "quality:hold";

        // Liberação técnica individual ou em lote de HUs bloqueadas (Somente Gestão)
        public const string Release = "quality:release";

        // Cadastro/gestão de motivos de qualidade e exclusão de ocorrências em estornos (Gestão)
        public const string Manage = "quality:manage";
    }

    public static class Billing
    {
        // Visualizar ciclos de faturamento e detalhes dos lançamentos
        public const string View = "billing:view";

        // Exportar extrato da fatura (HTML/Impressão e CSV)
        public const string Export = "billing:export";

        // Gestão completa: lançamentos manuais, fechamento/geração de ciclos, serviços e tarifas (Somente Interno)
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
        // Visualizar agenda e pátio (Operação, Gestão e Cliente B2B)
        public const string View = "yard:view";

        // Criar agendamentos programados e importar XML gerando ordem (Gestão e Cliente B2B)
        public const string Schedule = "yard:schedule";

        // Check-in, Check-out, Encostar na Doca e Vincular Ordens (Somente Equipe Interna)
        public const string Operate = "yard:operate";

        // Entrada direta no pátio, editar, cancelar e excluir agendamentos (Somente Gestão Interna)
        public const string Manage = "yard:manage";
    }

    public static class CycleCount
    {
        // Visualização de planos de inventário, detalhes das contagens e métricas IRA
        public const string View = "cyclecount:view";

        // Criar novos planos de inventário (Gestão Interna e Externo - Gestão)
        public const string Create = "cyclecount:create";

        // Exportação / download de extratos dos planos de inventário
        public const string Export = "cyclecount:export";

        // Execução de contagens no coletor (planos atribuídos e contagens espontâneas)
        public const string Count = "cyclecount:count";

        // Gestão completa: criar planos, aprovar, solicitar recontagem, aplicar ajustes e encerrar
        public const string Manage = "cyclecount:manage";
    }
}