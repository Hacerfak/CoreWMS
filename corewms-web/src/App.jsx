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

              <Route element={<PermissionGuard requiredPermission="users:view" />}>
                <Route path="/usuarios" element={<UsuariosList />} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="roles:view" />}>
                <Route path="/perfis" element={<PerfisList />} />
              </Route>

              {/* Rotas Futuras em Breve */}
              <Route element={<PermissionGuard requiredPermission="companies:view" />}>
                <Route path="/empresas" element={<div className="p-8 text-slate-400">Em Breve</div>} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="printing:manage" />}>
                <Route path="/impressao" element={<div className="p-8 text-slate-400">Em Breve</div>} />
              </Route>

              <Route element={<PermissionGuard requiredPermission="audit:view" />}>
                <Route path="/auditoria" element={<div className="p-8 text-slate-400">Em Breve</div>} />
              </Route>

            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}