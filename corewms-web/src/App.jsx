import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import InboundPage from '@/pages/Inbound/InboundPage';
import InboundWorkspacePage from '@/pages/Inbound/InboundWorkspacePage';

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

// NOVO: Guardião de Rota Baseado em Permissões
const PermissionGuard = ({ requiredPermission }) => {
  const hasAccess = useHasPermission(requiredPermission);
  return hasAccess ? <Outlet /> : <Navigate to="/dashboard" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        <Route element={<PrivateRoute />}>
          <Route path="/selecao-empresa" element={<SelecaoEmpresa />} />
          <Route path="/onboarding" element={<Onboarding />} />

          <Route element={<CompanyGuard />}>
            <Route element={<MainLayout />}>

              <Route path="/dashboard" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Painel do Dashboard em construção
                </div>
              } />

              <Route element={<PermissionGuard requiredPermission="customers:view" />}>
                <Route path="/clientes" element={<ClientesList />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="inbound:view" />}>
                <Route path="/inbound" element={<InboundPage />} />
                <Route path="/inbound/:id" element={<InboundWorkspacePage />} /> {/* <-- ROTA NOVA */}
              </Route>

              <Route element={<PermissionGuard requiredPermission="users:manage" />}>
                <Route path="/usuarios" element={<UsuariosList />} />
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

            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}