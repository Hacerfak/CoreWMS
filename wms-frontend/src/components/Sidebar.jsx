import { useState, useContext } from 'react';
import {
    Box, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
    Typography, Collapse, Divider
} from '@mui/material';
import {
    Home, PackagePlus, Box as BoxIcon, Truck, Settings, Users,
    Contact, Package, MapPin, ChevronDown, ChevronRight, Building2, Shield, History,
    LayoutDashboard, ClipboardCheck, FileText,
    LayoutList, Printer, Construction, Boxes, Container
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { userCan } = useContext(AuthContext);

    // Estado para controlar quais grupos estão abertos
    const [openGroups, setOpenGroups] = useState({
        operacao: true,
        gestao: false,
        config: false
    });

    const toggleGroup = (group) => {
        setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    // Estrutura do Menu Agrupado com Ícones de Grupo
    const menuStructure = [
        {
            title: 'Principal',
            groupIcon: <Home size={18} />, // Ícone do Grupo Principal
            items: [
                { text: 'Dashboard', icon: <LayoutDashboard size={20} />, path: '/dashboard', permission: null }
            ]
        },
        {
            id: 'operacao',
            title: 'Operação',
            groupIcon: <ClipboardCheck size={18} />, // Ícone de Tarefas/Operação
            items: [
                { text: 'Portaria', icon: <Construction size={20} />, path: '/portaria', permission: 'PORTARIA_VISUALIZAR' },
                { text: 'Recebimento', icon: <PackagePlus size={20} />, path: '/recebimento', permission: 'RECEBIMENTO_VISUALIZAR' },
                { text: 'Armazenamento', icon: <Boxes size={20} />, path: '/estoque', permission: 'ESTOQUE_VISUALIZAR' },
                { text: 'Expedição', icon: <Truck size={20} />, path: '/expedicao', permission: 'PEDIDO_VISUALIZAR' }
            ]
        },
        {
            id: 'gestao',
            title: 'Gestão',
            groupIcon: <LayoutList size={18} />, // Ícone de Arquivo/Cadastros
            items: [
                { text: 'Produtos', icon: <Package size={20} />, path: '/cadastros/produtos', permission: 'PRODUTO_VISUALIZAR' },
                { text: 'Parceiros', icon: <Contact size={20} />, path: '/cadastros/parceiros', permission: 'PARCEIRO_VISUALIZAR' },
                { text: 'Endereços', icon: <MapPin size={20} />, path: '/cadastros/locais', permission: 'LOCALIZACAO_VISUALIZAR' },
                { text: 'Formatos LPN', icon: <Container size={20} />, path: '/cadastros/formatos-lpn', permission: 'ESTOQUE_GERENCIAR' }
            ]
        },
        {
            id: 'relatorios',
            title: 'Relatórios',
            groupIcon: <FileText size={18} />, // Ícone de Relatórios
            items: [
                { text: 'Auditoria', icon: <History size={20} />, path: '/auditoria', permission: 'AUDITORIA_VISUALIZAR' }
            ]
        },
        {
            id: 'config',
            title: 'Configurações',
            groupIcon: <Settings size={18} />, // Ícone de Configurações
            items: [
                { text: 'Minha Empresa', icon: <Building2 size={20} />, path: '/config/empresa', permission: 'CONFIG_GERENCIAR' },
                { text: 'Usuários', icon: <Users size={20} />, path: '/usuarios', permission: 'USUARIO_LISTAR' },
                { text: 'Perfis de Acesso', icon: <Shield size={20} />, path: '/perfis', permission: 'PERFIL_GERENCIAR' },
                { text: 'Impressão', icon: <Printer size={20} />, path: '/config/impressao', permission: 'CONFIG_SISTEMA' },
            ]
        }
    ];

    const renderMenuItem = (item) => {
        if (item.permission && !userCan(item.permission)) return null;

        const isActive = location.pathname.startsWith(item.path);

        return (
            <ListItem key={item.path} disablePadding sx={{ display: 'block', mb: 0.5 }}>
                <ListItemButton
                    onClick={() => navigate(item.path)}
                    sx={{
                        minHeight: 40,
                        px: 2.5,
                        borderRadius: 2,
                        mx: 1,
                        bgcolor: isActive ? (theme) => theme.palette.primary.light + '20' : 'transparent',
                        color: isActive ? 'primary.main' : 'text.secondary',
                        '&:hover': {
                            bgcolor: isActive ? (theme) => theme.palette.primary.light + '30' : 'background.subtle',
                            color: 'primary.main'
                        }
                    }}
                >
                    <ListItemIcon sx={{ minWidth: 35, color: 'inherit' }}>
                        {item.icon}
                    </ListItemIcon>
                    <ListItemText
                        primary={item.text}
                        primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: isActive ? 600 : 500 }}
                    />
                </ListItemButton>
            </ListItem>
        );
    };

    return (
        <Box sx={{ width: 260, flexShrink: 0, bgcolor: 'background.paper', borderRight: 1, borderColor: 'divider', height: '100vh', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            {/* Header do Menu */}
            <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <Box sx={{ width: 32, height: 32, bgcolor: 'primary.main', borderRadius: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                    <BoxIcon size={20} />
                </Box>
                <Typography variant="h6" fontWeight="bold" color="text.primary" sx={{ letterSpacing: -0.5 }}>
                    WMS Core
                </Typography>
            </Box>

            <List component="nav" sx={{ px: 0, pt: 0 }}>
                {menuStructure.map((group, index) => {
                    // Se o grupo não tem itens visíveis para o usuário, não renderiza o grupo
                    const hasVisibleItems = group.items.some(i => !i.permission || userCan(i.permission));
                    if (!hasVisibleItems) return null;

                    return (
                        <Box key={index} sx={{ mb: 1 }}>
                            {group.title !== 'Principal' && (
                                <ListItemButton onClick={() => toggleGroup(group.id)} sx={{ py: 1.5, px: 3 }}>
                                    {/* ÍCONE DO GRUPO ADICIONADO AQUI */}
                                    <ListItemIcon sx={{ minWidth: 32, color: openGroups[group.id] ? 'primary.main' : 'text.secondary' }}>
                                        {group.groupIcon}
                                    </ListItemIcon>

                                    <ListItemText
                                        primary={group.title}
                                        primaryTypographyProps={{
                                            fontSize: '0.75rem',
                                            fontWeight: 700,
                                            color: openGroups[group.id] ? 'primary.main' : 'text.secondary',
                                            textTransform: 'uppercase'
                                        }}
                                    />
                                    {openGroups[group.id] ? <ChevronDown size={16} color="#94a3b8" /> : <ChevronRight size={16} color="#94a3b8" />}
                                </ListItemButton>
                            )}

                            <Collapse in={group.title === 'Principal' ? true : openGroups[group.id]} timeout="auto" unmountOnExit>
                                <List component="div" disablePadding>
                                    {group.items.map(item => renderMenuItem(item))}
                                </List>
                            </Collapse>

                            {group.title === 'Principal' && <Divider sx={{ my: 2, mx: 3 }} />}
                        </Box>
                    );
                })}
            </List>
        </Box>
    );
};

export default Sidebar;