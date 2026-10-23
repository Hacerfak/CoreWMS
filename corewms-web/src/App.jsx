import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import { useHasPermission } from '@/hooks/useHasPermission';

import Login from '@/pages/Login/Login';
import SelecaoEmpresa from '@/pages/Login/SelecaoEmpresa';
import Onboarding from '@/pages/Login/Onboarding';
import MainLayout from '@/layouts/MainLayout';
import ClientesList from '@/pages/Clientes/ClientesList';
import UsuariosList from '@/pages/Usuarios/UsuariosList';
import PerfisList from '@/pages/Perfis/PerfisList';
import ImpressaoPage from '@/pages/Impressao/ImpressaoPage';
import AuditoriaPage from '@/pages/Auditoria/AuditoriaPage';
import EmpresasPage from './pages/Empresas/EmpresasPage';
import TopologiaPage from '@/pages/Topologia/TopologiaPage';
import ProdutosPage from '@/pages/Produtos/ProdutosPage';
import InboundOperacaoPage from '@/pages/Inbound/InboundOperacaoPage';
import ConferenciaItemPage from '@/pages/Inbound/ConferenciaItemPage';
import InboundList from '@/pages/Inbound/InboundList';
import ReviewInbound from '@/pages/Inbound/ReviewInbound';
import InboundOrderHusPage from '@/pages/Inbound/InboundOrderHusPage';
import GerenciarAcessosPage from '@/pages/Usuarios/GerenciarAcessosPage';
import EstoquePage from '@/pages/Estoque/EstoquePage';
import QualidadePage from '@/pages/Qualidade/QualidadePage';
import TarifasECiclosPage from '@/pages/Billing/TarifasECiclosPage';
import ExtratoFaturamentoPage from '@/pages/Billing/ExtratoFaturamentoPage';
import InventarioGestaoPage from '@/pages/Inventario/InventarioGestaoPage';
import NovoInventarioPage from '@/pages/Inventario/NovoInventarioPage';
import InventarioDetalhesPage from '@/pages/Inventario/InventarioDetalhesPage';
import InventarioOperacaoPage from '@/pages/Inventario/InventarioOperacaoPage';
import ExecucaoContagemPage from '@/pages/Inventario/ExecucaoContagemPage';
import OutboundListPage from '@/pages/Outbound/OutboundListPage';
import OutboundOrderDetailsPage from '@/pages/Outbound/OutboundOrderDetailsPage';
import CreateOutboundOrderPage from '@/pages/Outbound/CreateOutboundOrderPage';
import OutboundItemsPanelPage from '@/pages/Outbound/OutboundItemsPanelPage';
import OutboundPickingPage from '@/pages/Outbound/OutboundPickingPage';
import OutboundPackingPage from '@/pages/Outbound/OutboundPackingPage';
import OutboundCheckingPage from '@/pages/Outbound/OutboundCheckingPage';
import OutboundFiscalReviewPage from '@/pages/Outbound/OutboundFiscalReviewPage';
import AlocacaoInteligentePage from '@/pages/Inbound/AlocacaoInteligentePage';
import FiscalOperationRulesPage from '@/pages/Fiscal/FiscalOperationRulesPage';
import CreateOrEditFiscalRulePage from '@/pages/Fiscal/CreateOrEditFiscalRulePage';
import CreateOrEditRuleExceptionPage from '@/pages/Fiscal/CreateOrEditRuleExceptionPage';
import CompanyFiscalDocumentsPage from '@/pages/Fiscal/CompanyFiscalDocumentsPage';
import CompanyFiscalDocumentDetailsPage from '@/pages/Fiscal/CompanyFiscalDocumentDetailsPage';
import CreateStandaloneNfePage from '@/pages/Fiscal/CreateStandaloneNfePage';
import PublicDanfePage from '@/pages/Fiscal/PublicDanfePage';

// Componente para sincronização automática do título do separador
function PageTitleHandler() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = 'Início';

    if (path === '/login') title = 'Acesso';
    else if (path === '/selecao-empresa') title = 'Seleção de Empresa';
    else if (path === '/onboarding') title = 'Boas-vindas';
    else if (path === '/dashboard') title = 'Dashboard';
    else if (path.startsWith('/clientes')) title = 'Clientes';
    else if (path.startsWith('/usuarios')) title = 'Usuários';
    else if (path.startsWith('/perfis')) title = 'Perfis de Acesso';
    else if (path.startsWith('/empresas')) title = 'Empresas';
    else if (path.startsWith('/impressao')) title = 'Central de Impressão';
    else if (path.startsWith('/auditoria')) title = 'Auditoria';
    else if (path.startsWith('/topologia')) title = 'Topologia do Armazém';
    else if (path.startsWith('/produtos')) title = 'Produtos e Embalagens';
    else if (path === '/estoque') title = 'Estoque e Relatórios';
    else if (path === '/inventario/gestao/novo') title = 'Novo Inventário';
    else if (path.startsWith('/inventario/gestao/')) title = 'Detalhes do Inventário';
    else if (path === '/inventario/gestao') title = 'Gestão de Inventário';
    else if (path.startsWith('/inventario/operacao/')) title = 'Contagem de Inventário';
    else if (path.startsWith('/inventario/operacao')) title = 'Operação de Inventário';
    else if (path === '/inbound') title = 'Recebimento';
    else if (path.startsWith('/inbound/revisao')) title = 'Revisão de Entrada';
    else if (path.includes('/alocacao')) title = 'Alocação Inteligente';
    else if (path.includes('/hus')) title = 'HUs do Recebimento';
    else if (path.includes('/item/')) title = 'Conferência de Item';
    else if (path.startsWith('/inbound/operacao/')) title = 'Conferência de Entrada';
    else if (path.startsWith('/qualidade')) title = 'Controle de Qualidade';
    else if (path.startsWith('/billing/tarifas-ciclos')) title = 'Tarifas e Ciclos';
    else if (path.startsWith('/billing/ciclos/')) title = 'Extrato de Faturamento';
    else if (path === '/outbound') title = 'Expedição';
    else if (path.startsWith('/outbound/novo')) title = 'Nova Ordem de Saída';
    else if (path.startsWith('/outbound/editar/')) title = 'Editar Ordem de Saída';
    else if (path.includes('/itens')) title = 'Itens do Pedido';
    else if (path.startsWith('/outbound/detalhes/')) title = 'Detalhes da Expedição';
    else if (path.startsWith('/outbound/picking/')) title = 'Separação (Picking)';
    else if (path.startsWith('/outbound/packing/')) title = 'Conferência Packing';
    else if (path.startsWith('/outbound/conferencia/')) title = 'Conferência de Saída';
    else if (path.startsWith('/outbound/revisao-fiscal/')) title = 'Revisão e Expedição';
    else if (path.startsWith('/fiscal/regras/nova')) title = 'Nova Regra Fiscal';
    else if (path.startsWith('/fiscal/regras/')) title = 'Editar Regra Fiscal';
    else if (path === '/fiscal/regras') title = 'Regras Fiscais';
    else if (path === '/fiscal/documentos/novo') title = 'Emissão Avulsa NF-e';
    else if (path.startsWith('/fiscal/documentos/')) title = 'Detalhes do Documento Fiscal';
    else if (path === '/fiscal/documentos') title = 'Documentos Fiscais';
    else if (path.startsWith('/public/danfe/')) title = 'DANFE Online';

    document.title = `${title} | CoreWMS`;
  }, [location]);

  return null;
}

const PrivateRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

const CompanyGuard = () => {
  const companyId = useAuthStore((s) => s.companyId);
  return companyId ? <Outlet /> : <Navigate to="/selecao-empresa" replace />;
};

const PublicRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <Navigate to="/selecao-empresa" replace /> : <Outlet />;
};

const PermissionGuard = ({ requiredPermission }) => {
  const hasAccess = useHasPermission(requiredPermission);
  return hasAccess ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <PageTitleHandler />
      <Routes>
        <Route path="/public/danfe/:accessKey" element={<PublicDanfePage />} />

        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<PrivateRoute />}>
          <Route path="/selecao-empresa" element={<SelecaoEmpresa />} />
          <Route path="/onboarding" element={<Onboarding />} />

          <Route element={<CompanyGuard />}>
            <Route element={<MainLayout />}>

              <Route path="/dashboard" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-xs flex items-center justify-center text-slate-400">
                  Painel do Dashboard em construção
                </div>
              } />

              <Route element={<PermissionGuard requiredPermission="customers:view" />}>
                <Route path="/clientes" element={<ClientesList />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="users:manage" />}>
                <Route path="/usuarios" element={<UsuariosList />} />
                <Route path="/usuarios/:id/acessos" element={<GerenciarAcessosPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="roles:manage" />}>
                <Route path="/perfis" element={<PerfisList />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="companies:manage" />}>
                <Route path="/empresas" element={<EmpresasPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="printing:manage" />}>
                <Route path="/impressao" element={<ImpressaoPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="audit:view" />}>
                <Route path="/auditoria" element={<AuditoriaPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="topology:manage" />}>
                <Route path="/topologia" element={<TopologiaPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="products:view" />}>
                <Route path="/produtos" element={<ProdutosPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inventory:view" />}>
                <Route path="/estoque" element={<EstoquePage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inventory:manageQuality" />}>
                <Route path="/inventario/gestao" element={<InventarioGestaoPage />} />
                <Route path="/inventario/gestao/novo" element={<NovoInventarioPage />} />
                <Route path="/inventario/gestao/:id" element={<InventarioDetalhesPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inventory:view" />}>
                <Route path="/inventario/operacao" element={<InventarioOperacaoPage />} />
                <Route path="/inventario/operacao/:taskId" element={<ExecucaoContagemPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inbound:view" />}>
                <Route path="/inbound" element={<InboundList />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inbound:review" />}>
                <Route path="/inbound/revisao" element={<ReviewInbound />} />
                <Route path="/inbound/revisao/:id" element={<ReviewInbound />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inbound:receive" />}>
                <Route path="/inbound/operacao/:id" element={<InboundOperacaoPage />} />
                <Route path="/inbound/operacao/:orderId/item/:itemId" element={<ConferenciaItemPage />} />
                <Route path="/inbound/operacao/:id/hus" element={<InboundOrderHusPage />} />
                <Route path="/inbound/operacao/:id/alocacao" element={<AlocacaoInteligentePage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inventory:manageQuality" />}>
                <Route path="/qualidade" element={<QualidadePage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="billing:view" />}>
                <Route path="/billing/tarifas-ciclos" element={<TarifasECiclosPage />} />
                <Route path="/billing/ciclos/:id" element={<ExtratoFaturamentoPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="outbound:view" />}>
                <Route path="/outbound" element={<OutboundListPage />} />
                <Route path="/outbound/detalhes/:id" element={<OutboundOrderDetailsPage />} />
                <Route path="/outbound/picking/:id" element={<OutboundPickingPage />} />
                <Route path="/outbound/packing/:id" element={<OutboundPackingPage />} />
                <Route path="/outbound/conferencia/:id" element={<OutboundCheckingPage />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="outbound:manage" />}>
                <Route path="/outbound/novo" element={<CreateOutboundOrderPage />} />
                <Route path="/outbound/editar/:id" element={<CreateOutboundOrderPage />} />
                <Route path="/outbound/ordem/:id/itens" element={<OutboundItemsPanelPage />} />
                <Route path="/outbound/revisao-fiscal/:id" element={<OutboundFiscalReviewPage />} />
                <Route path="/fiscal/regras" element={<FiscalOperationRulesPage />} />
                <Route path="/fiscal/regras/nova" element={<CreateOrEditFiscalRulePage />} />
                <Route path="/fiscal/regras/:id" element={<CreateOrEditFiscalRulePage />} />
                <Route path="/fiscal/regras/:ruleId/excecoes/nova" element={<CreateOrEditRuleExceptionPage />} />
                <Route path="/fiscal/regras/:ruleId/excecoes/:exceptionId" element={<CreateOrEditRuleExceptionPage />} />
                <Route path="/fiscal/documentos" element={<CompanyFiscalDocumentsPage />} />
                <Route path="/fiscal/documentos/:id" element={<CompanyFiscalDocumentDetailsPage />} />
                <Route path="/fiscal/documentos/novo" element={<CreateStandaloneNfePage />} />
              </Route>

            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}