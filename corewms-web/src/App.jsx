import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import Login from '@/pages/Login/Login';
import SelecaoEmpresa from '@/pages/Login/SelecaoEmpresa';
import Onboarding from '@/pages/Login/Onboarding';
import MainLayout from '@/layouts/MainLayout';
import ClientesList from '@/pages/Clientes/ClientesList';

// Guardião de Autenticação (Precisa ter token JWT)
const PrivateRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

// Guardião de Empresa (Exige X-Company-Id ativo para enviar nas APIs)
const CompanyGuard = () => {
  const companyId = useAuthStore((s) => s.companyId);
  return companyId ? <Outlet /> : <Navigate to="/selecao-empresa" replace />;
};

// Guardião de Rota Pública (Se já estiver logado, redireciona)
const PublicRoute = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <Navigate to="/selecao-empresa" replace /> : <Outlet />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota Pública (Apenas deslogados) */}
        <Route element={<PublicRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* Rotas Protegidas por Autenticação */}
        <Route element={<PrivateRoute />}>

          {/* Telas Fullscreen (Não exigem X-Company-Id prévio) */}
          <Route path="/selecao-empresa" element={<SelecaoEmpresa />} />
          <Route path="/onboarding" element={<Onboarding />} />

          {/* Telas Internas da Operação (Exigem X-Company-Id ativo no cabeçalho) */}
          <Route element={<CompanyGuard />}>
            <Route element={<MainLayout />}>

              {/* Visão Geral */}
              <Route path="/dashboard" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Painel do Dashboard em construção
                </div>
              } />

              {/* Cadastros Base */}
              <Route path="/clientes" element={<ClientesList />} />

              {/* Segurança */}
              <Route path="/usuarios" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Gestão de Usuários (Em breve)
                </div>
              } />
              <Route path="/perfis" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Perfis de Acesso (Em breve)
                </div>
              } />

              {/* Configurações */}
              <Route path="/empresas" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Gestão de Empresas (Em breve)
                </div>
              } />
              <Route path="/impressao" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Configurações de Impressão (Em breve)
                </div>
              } />
              <Route path="/auditoria" element={
                <div className="bg-white border border-slate-200/60 rounded-xl p-8 h-full shadow-sm flex items-center justify-center text-slate-400">
                  Logs de Auditoria (Em breve)
                </div>
              } />

            </Route>
          </Route>

        </Route>

        {/* Redirecionamento Padrão */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}