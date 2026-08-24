import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme/theme';
import { AuthProvider, AuthContext } from './contexts/AuthContext';
import { useContext } from 'react';
import Can from './components/Can';
import { PERMISSIONS } from './constants/permissions';

// Imports das Páginas
import Login from './pages/Login/Login';
import Onboarding from './pages/Login/Onboarding';
import SelecaoEmpresa from './pages/Login/SelecaoEmpresa';
import Dashboard from './pages/Dashboard/Dashboard';

// CADASTROS
import ParceiroList from './pages/Cadastros/ParceiroList';
import ParceiroForm from './pages/Cadastros/ParceiroForm';
import ProdutoList from './pages/Cadastros/ProdutoList';
import ProdutoForm from './pages/Cadastros/ProdutoForm';
import MapeamentoView from './pages/Cadastros/Mapeamento/MapeamentoView';
import FormatoLpnList from './pages/Cadastros/Estoque/FormatoLpnList';

//PORTARIA
import PortariaMenu from './pages/Portaria/PortariaMenu';
import TurnoList from './pages/Portaria/Turnos/TurnoList';
import AgendamentoList from './pages/Portaria/Agendamento/AgendamentoList';
import AgendamentoForm from './pages/Portaria/Agendamento/AgendamentoForm';
import OperacaoPortaria from './pages/Portaria/Operacao/OperacaoPortaria';

// OPERAÇÃO
import RecebimentoMenu from './pages/Recebimento/RecebimentoMenu';
import TarefasRecebimentoList from './pages/Recebimento/TarefasRecebimentoList';
import RecebimentoList from './pages/Recebimento/RecebimentoList';
import Recebimento from './pages/Recebimento/Recebimento';
import Conferencia from './pages/Recebimento/Conferencia';
import DivergenciaList from './pages/Recebimento/DivergenciaList';
import RecebimentoDetalhes from './pages/Recebimento/RecebimentoDetalhes';

// ESTOQUE
import EstoqueList from './pages/Estoque/EstoqueList';
import Armazenagem from './pages/Estoque/Armazenagem';

// EXPEDIÇÃO
import ExpedicaoMenu from './pages/Expedicao/ExpedicaoMenu';
import Checkout from './pages/Expedicao/Checkout';

// CONFIGURAÇÃO E ADMIN
import UsuariosList from './pages/Usuarios/UsuariosList';
import UsuarioForm from './pages/Usuarios/UsuarioForm';
import PerfisList from './pages/Usuarios/PerfisList';
import MinhaEmpresa from './pages/Configuracao/MinhaEmpresa';
import GestaoEmpresas from './pages/Admin/GestaoEmpresas';
import PrintHubView from './pages/Configuracao/PrintHub/PrintHubView';

// RELATÓRIOS
import AuditoriaList from './pages/Relatorios/AuditoriaList';

import MainLayout from './layout/MainLayout';

const PrivateRoute = ({ children }) => {
  const { authenticated, loading } = useContext(AuthContext);
  if (loading) return <div>Carregando...</div>;
  if (!authenticated) return <Navigate to="/login" />;
  return children ? children : <Outlet />;
};

// CORREÇÃO: Removemos MainLayout daqui para evitar duplicação
const ProtectedRoute = ({ children, permission }) => (
  <Can permissions={permission} elseShow={<Navigate to="/dashboard" />}>
    {children}
  </Can>
);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <ToastContainer position="top-right" autoClose={3000} />
          <Routes>
            {/* ROTAS PÚBLICAS */}
            <Route path="/login" element={<Login />} />

            {/* --- ROTAS PRIVADAS: SEM LAYOUT (Seleção, Onboarding) --- */}
            <Route element={<PrivateRoute />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="/selecao-empresa" element={<SelecaoEmpresa />} />
            </Route>

            {/* --- ROTAS PRIVADAS: COM LAYOUT (Aplicação Principal) --- */}
            <Route element={<PrivateRoute><MainLayout /></PrivateRoute>}>

              {/* Dashboard */}
              <Route path="/dashboard" element={<Dashboard />} />

              {/* CADASTROS */}
              <Route path="/cadastros/produtos" element={<ProtectedRoute permission={PERMISSIONS.PRODUTO_VISUALIZAR}><ProdutoList /></ProtectedRoute>} />
              <Route path="/cadastros/produtos/novo" element={<ProtectedRoute permission={PERMISSIONS.PRODUTO_GERENCIAR}><ProdutoForm /></ProtectedRoute>} />
              <Route path="/cadastros/produtos/:id" element={<ProtectedRoute permission={PERMISSIONS.PRODUTO_GERENCIAR}><ProdutoForm /></ProtectedRoute>} />

              <Route path="/cadastros/parceiros" element={<ProtectedRoute permission={PERMISSIONS.PARCEIRO_VISUALIZAR}><ParceiroList /></ProtectedRoute>} />
              <Route path="/cadastros/parceiros/novo" element={<ProtectedRoute permission={PERMISSIONS.PARCEIRO_GERENCIAR}><ParceiroForm /></ProtectedRoute>} />
              <Route path="/cadastros/parceiros/:id" element={<ProtectedRoute permission={PERMISSIONS.PARCEIRO_GERENCIAR}><ParceiroForm /></ProtectedRoute>} />

              <Route path="/cadastros/locais" element={<ProtectedRoute permission={PERMISSIONS.LOCALIZACAO_VISUALIZAR}><MapeamentoView /></ProtectedRoute>} />
              <Route path="/cadastros/formatos-lpn" element={<ProtectedRoute permission={PERMISSIONS.ESTOQUE_GERENCIAR}><FormatoLpnList /></ProtectedRoute>} />

              {/* PORTARIA */}
              <Route path="/portaria" element={<ProtectedRoute permission="PORTARIA_AGENDAR"><PortariaMenu /></ProtectedRoute>} />
              <Route path="/portaria/agenda" element={<ProtectedRoute permission="PORTARIA_AGENDAR"><AgendamentoList /></ProtectedRoute>} />
              <Route path="/portaria/operacao" element={<ProtectedRoute permission="PORTARIA_OPERAR"><OperacaoPortaria /></ProtectedRoute>} />
              <Route path="/portaria/turnos" element={<ProtectedRoute permission="CONFIG_GERENCIAR"><TurnoList /></ProtectedRoute>} />

              {/* Alias para vínculo de XML (reusa a lista de agenda) */}
              <Route path="/portaria/vinculo-xml" element={<ProtectedRoute permission="RECEBIMENTO_IMPORTAR_XML"><AgendamentoList /></ProtectedRoute>} />

              {/* OPERAÇÃO - RECEBIMENTO */}
              {/* 1. Menu Principal */}
              <Route path="/recebimento" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_VISUALIZAR}><RecebimentoMenu /></ProtectedRoute>} />
              {/* 2. Lista de Tarefas (Coletor) - NOVA ROTA */}
              <Route path="/recebimento/tarefas" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_CONFERIR}><TarefasRecebimentoList /></ProtectedRoute>} />
              {/* 3. Lista Gerencial (Antiga lista padrão) */}
              <Route path="/recebimento/lista" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_VISUALIZAR}><RecebimentoList /></ProtectedRoute>} />
              {/* 4. Importação XML */}
              <Route path="/recebimento/importar" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_IMPORTAR_XML}><Recebimento /></ProtectedRoute>} />
              {/* 5. Execução da Conferência */}
              <Route path="/recebimento/:id/conferencia" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_OPERAR}><Conferencia /></ProtectedRoute>} />
              <Route path="/recebimento/divergencias" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_FINALIZAR}><DivergenciaList /></ProtectedRoute>} />
              <Route path="/recebimento/:id/detalhes" element={<ProtectedRoute permission={PERMISSIONS.RECEBIMENTO_VISUALIZAR}><RecebimentoDetalhes /></ProtectedRoute>} />

              <Route path="/estoque" element={<ProtectedRoute permission={PERMISSIONS.ESTOQUE_VISUALIZAR}><EstoqueList /></ProtectedRoute>} />
              <Route path="/estoque/armazenagem" element={<ProtectedRoute permission={PERMISSIONS.ESTOQUE_OPERAR}><Armazenagem /></ProtectedRoute>} />

              {/* EXPEDIÇÃO */}
              <Route path="/expedicao" element={<ProtectedRoute permission={PERMISSIONS.EXPEDICAO_VISUALIZAR}><ExpedicaoMenu /></ProtectedRoute>} />
              <Route path="/expedicao/checkout" element={<ProtectedRoute permission={PERMISSIONS.EXPEDICAO_OPERAR}><Checkout /></ProtectedRoute>} />

              {/* ADMIN & CONFIG */}
              <Route path="/usuarios" element={<ProtectedRoute permission={PERMISSIONS.USUARIO_GERENCIAR}><UsuariosList /></ProtectedRoute>} />
              <Route path="/usuarios/novo" element={<ProtectedRoute permission={PERMISSIONS.USUARIO_GERENCIAR}><UsuarioForm /></ProtectedRoute>} />
              <Route path="/usuarios/:id" element={<ProtectedRoute permission={PERMISSIONS.USUARIO_GERENCIAR}><UsuarioForm /></ProtectedRoute>} />

              <Route path="/perfis" element={<ProtectedRoute permission={PERMISSIONS.PERFIL_GERENCIAR}><PerfisList /></ProtectedRoute>} />
              <Route path="/config/empresa" element={<ProtectedRoute permission={PERMISSIONS.CONFIG_EMPRESA}><MinhaEmpresa /></ProtectedRoute>} />
              <Route path="/admin/empresas" element={<ProtectedRoute permission="ADMIN"><GestaoEmpresas /></ProtectedRoute>} />

              <Route path="/config/impressao" element={<ProtectedRoute permission={PERMISSIONS.CONFIG_SISTEMA}><PrintHubView /></ProtectedRoute>} />

              {/* RELATÓRIOS */}
              <Route path="/auditoria" element={<ProtectedRoute permission={PERMISSIONS.AUDITORIA_VER}><AuditoriaList /></ProtectedRoute>} />

              {/* Redirecionamento Padrão */}
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="*" element={<Navigate to="/dashboard" />} />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;