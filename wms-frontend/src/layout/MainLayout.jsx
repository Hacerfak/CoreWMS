import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, Menu, MenuItem, Divider, ListItemIcon, Tooltip, Chip } from '@mui/material';
import { LogOut, Building2, Check, Settings, User } from 'lucide-react'; // Adicionei User aqui
import { useContext, useState, useMemo } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import Sidebar from '../components/Sidebar';
import { useNavigate, Outlet } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';

const MainLayout = () => {
    const { logout, user, selecionarEmpresa } = useContext(AuthContext);
    const navigate = useNavigate();
    const [anchorEl, setAnchorEl] = useState(null);

    const handleMenu = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    const handleLogout = () => {
        handleClose();
        logout();
        navigate('/login');
    };

    const empresaAtual = useMemo(() => {
        const token = localStorage.getItem('wms_token');
        if (!token || !user?.empresas) return null;
        try {
            const decoded = jwtDecode(token);
            return user.empresas.find(e => e.tenantId === decoded.tenant);
        } catch (e) { return null; }
    }, [user]);

    const handleTrocarEmpresa = async (tenantId) => {
        handleClose();
        if (empresaAtual?.tenantId === tenantId) return;
        const success = await selecionarEmpresa(tenantId);
        // Recarrega a página para garantir limpeza total de estados do contexto anterior
        if (success) navigate(0);
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
            <Sidebar />
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid #e2e8f0', bgcolor: 'white', px: 2 }}>
                    <Toolbar>
                        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h6" sx={{ color: 'text.secondary', fontSize: '1rem', fontWeight: 500 }}>
                                Empresa atual:
                            </Typography>
                            {empresaAtual && (
                                <Chip icon={<Building2 size={16} />} label={empresaAtual.razaoSocial} color="primary" variant="outlined" size="small" />
                            )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight={500} sx={{ display: { xs: 'none', sm: 'block' } }}>
                                {user?.nome || 'Usuário'}
                            </Typography>

                            <Tooltip title="Menu do Usuário">
                                <IconButton onClick={handleMenu} size="small" sx={{ ml: 1 }}>
                                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.9rem' }}>
                                        {user?.login?.substring(0, 2).toUpperCase()}
                                    </Avatar>
                                </IconButton>
                            </Tooltip>

                            <Menu
                                anchorEl={anchorEl}
                                open={Boolean(anchorEl)}
                                onClose={handleClose}
                                PaperProps={{ elevation: 2, sx: { mt: 1.5, minWidth: 240, borderRadius: 2 } }}
                                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                            >
                                <Box sx={{ px: 2, py: 1.5 }}>
                                    <Typography variant="subtitle2" color="text.secondary">Meus Ambientes</Typography>
                                </Box>

                                {user?.empresas?.map((empresa) => (
                                    <MenuItem
                                        key={empresa.tenantId}
                                        onClick={() => handleTrocarEmpresa(empresa.tenantId)}
                                        selected={empresaAtual?.tenantId === empresa.tenantId}
                                    >
                                        <ListItemIcon>
                                            {empresaAtual?.tenantId === empresa.tenantId ? <Check size={18} color="green" /> : <Building2 size={18} />}
                                        </ListItemIcon>
                                        <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                                            {empresa.razaoSocial}
                                        </Typography>
                                    </MenuItem>
                                ))}

                                <Divider sx={{ my: 1 }} />

                                {/* Acesso Master para Gerenciar Empresas */}
                                {user?.role === 'ADMIN' && (
                                    <MenuItem onClick={() => { handleClose(); navigate('/admin/empresas'); }}>
                                        <ListItemIcon><Settings size={18} /></ListItemIcon>
                                        Gerenciar Ambientes
                                    </MenuItem>
                                )}

                                {/* CORREÇÃO: handleCloseUserMenu -> handleClose */}
                                <MenuItem onClick={() => { handleClose(); navigate('/usuarios/' + user?.id); }}>
                                    <ListItemIcon><User size={16} /></ListItemIcon> Meus Dados
                                </MenuItem>

                                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                                    <ListItemIcon><LogOut size={18} color="#ef4444" /></ListItemIcon>
                                    Sair
                                </MenuItem>
                            </Menu>
                        </Box>
                    </Toolbar>
                </AppBar>
                <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default MainLayout;