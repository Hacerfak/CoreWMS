import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from './store/useAuthStore';
import { ThemeProvider, CssBaseline, createTheme } from '@mui/material';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login/Login';
import SelecaoEmpresa from './pages/Login/SelecaoEmpresa';
import MainLayout from './layout/MainLayout';

const theme = createTheme({ palette: { primary: { main: '#2563eb' } } });

const PrivateRoute = () => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <ToastContainer position="top-right" autoClose={3000} />
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route element={<PrivateRoute />}>
            {/* Rota sem layout lateral (Tela cheia) */}
            <Route path="/selecao-empresa" element={<SelecaoEmpresa />} />

            {/* Rotas com o Layout Principal */}
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<h2>Dashboard Carregado!</h2>} />
              {/* Futuramente: <Route path="/cadastros/depositantes" element={<CustomerList />} /> */}
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;