import { useState, useMemo } from 'react';
import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, Menu, MenuItem, Divider, ListItemIcon, Tooltip, Chip } from '@mui/material';
import { LogOut, Building2, Check, User } from 'lucide-react';
import { useNavigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';

// Um Sidebar simplificado (você pode copiar o seu antigo para cá depois)
const SidebarPlaceholder = () => (
    <Box sx={{ width: 260, flexShrink: 0, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', height: '100vh', p: 3 }}>
        <Typography variant="h6" fontWeight="bold" color="primary.main">CoreWMS</Typography>
    </Box>
);

const MainLayout = () => {
    const navigate = useNavigate();
    const { user, logout, companyId, setCompanyId, empresas } = useAuthStore();

    const [anchorEl, setAnchorEl] = useState(null);
    const handleMenu = (event) => setAnchorEl(event.currentTarget);
    const handleClose = () => setAnchorEl(null);

    const handleLogout = () => {
        handleClose();
        logout();
        navigate('/login');
    };

    // Identifica a empresa selecionada atualmente
    const empresaAtual = useMemo(() => {
        if (!companyId || !empresas) return null;
        return empresas.find(e => e.id === companyId);
    }, [companyId, empresas]);

    const handleTrocarEmpresa = (id) => {
        handleClose();
        if (empresaAtual?.id === id) return;
        setCompanyId(id);
        navigate(0); // Recarrega a aplicação para limpar caches de queries específicas da empresa
    };

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: '#f1f5f9' }}>
            <SidebarPlaceholder />
            <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid #e2e8f0', bgcolor: 'white', px: 2 }}>
                    <Toolbar>
                        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h6" sx={{ color: 'text.secondary', fontSize: '1rem', fontWeight: 500 }}>
                                Ambiente:
                            </Typography>
                            {empresaAtual && (
                                <Chip icon={<Building2 size={16} />} label={empresaAtual.corporateName} color="primary" variant="outlined" size="small" />
                            )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" fontWeight={500}>
                                {user?.nome}
                            </Typography>
                            <Tooltip title="Menu do Usuário">
                                <IconButton onClick={handleMenu} size="small" sx={{ ml: 1 }}>
                                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: '0.9rem' }}>
                                        {user?.nome?.substring(0, 2).toUpperCase()}
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
                                {empresas?.map((empresa) => (
                                    <MenuItem
                                        key={empresa.id}
                                        onClick={() => handleTrocarEmpresa(empresa.id)}
                                        selected={empresaAtual?.id === empresa.id}
                                    >
                                        <ListItemIcon>
                                            {empresaAtual?.id === empresa.id ? <Check size={18} color="green" /> : <Building2 size={18} />}
                                        </ListItemIcon>
                                        <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                                            {empresa.corporateName}
                                        </Typography>
                                    </MenuItem>
                                ))}
                                <Divider sx={{ my: 1 }} />
                                <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                                    <ListItemIcon><LogOut size={18} color="#ef4444" /></ListItemIcon>
                                    Sair
                                </MenuItem>
                            </Menu>
                        </Box>
                    </Toolbar>
                </AppBar>
                <Box sx={{ flexGrow: 1, overflow: 'auto', p: 3 }}>
                    {/* Aqui dentro vão as rotas filhas do React Router */}
                    <Outlet />
                </Box>
            </Box>
        </Box>
    );
};

export default MainLayout;