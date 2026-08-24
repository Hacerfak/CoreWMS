import { useState, useEffect, useContext } from 'react';
import {
    Box, Card, Typography, Grid, Button, CircularProgress, Avatar, Container
} from '@mui/material';
import { Building2, LogOut, ArrowRight, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AuthContext } from '../../contexts/AuthContext';
import { getMinhasEmpresas } from '../../services/empresaService';

const SelecaoEmpresa = () => {
    const navigate = useNavigate();
    const { selecionarEmpresa, logout, user } = useContext(AuthContext);

    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selecting, setSelecting] = useState(null);

    useEffect(() => {
        loadEmpresas();
    }, []);

    const loadEmpresas = async () => {
        try {
            const data = await getMinhasEmpresas();
            setEmpresas(data);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao carregar empresas vinculadas.");
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = async (tenantId) => {
        if (!tenantId) return toast.error("Erro: Identificador inválido.");

        setSelecting(tenantId);
        try {
            await selecionarEmpresa(tenantId);
            navigate('/dashboard');
        } catch (error) {
            console.error(error);
            toast.error("Falha ao acessar o ambiente da empresa.");
            setSelecting(null);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // --- NOVA LÓGICA: Redireciona para Onboarding ---
    const handleNewCompany = () => {
        // Passamos 'from' no state para o Onboarding saber voltar para cá
        navigate('/onboarding', { state: { from: '/selecao-empresa' } });
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <Box sx={{ bgcolor: 'white', py: 2, px: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 1 }}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Typography variant="h6" fontWeight="bold" color="primary">WMS Core</Typography>
                </Box>

                <Box display="flex" gap={2}>
                    {/* Botão Nova Empresa -> Vai para Onboarding */}
                    {user?.role === 'ADMIN' && (
                        <Button
                            variant="contained"
                            size="small"
                            startIcon={<Plus size={18} />}
                            onClick={handleNewCompany}
                        >
                            Nova Empresa
                        </Button>
                    )}

                    <Button startIcon={<LogOut size={18} />} color="inherit" onClick={handleLogout}>
                        Sair
                    </Button>
                </Box>
            </Box>

            <Container maxWidth="md" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: 4 }}>
                <Box mb={4} textAlign="center">
                    <Typography variant="h4" fontWeight="bold" color="#1e293b" gutterBottom>
                        Bem-vindo, {user?.nome}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Selecione o ambiente que deseja acessar.
                    </Typography>
                </Box>

                {loading ? (
                    <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
                ) : (
                    <Grid container spacing={3} justifyContent="center">
                        {empresas.map((empresa) => (
                            <Grid item xs={12} sm={6} md={4} key={empresa.id}>
                                <Card
                                    onClick={() => handleSelect(empresa.tenantId)}
                                    sx={{
                                        p: 3, cursor: 'pointer', transition: '0.2s', border: '1px solid transparent',
                                        position: 'relative',
                                        '&:hover': { transform: 'translateY(-4px)', boxShadow: 4, borderColor: 'primary.main' }
                                    }}
                                >
                                    <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" gap={2}>
                                        <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.light', color: 'primary.main' }}>
                                            <Building2 size={28} />
                                        </Avatar>
                                        <Box>
                                            <Typography variant="h6" fontWeight="bold" noWrap>{empresa.razaoSocial}</Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">CNPJ: {empresa.cnpj}</Typography>
                                            <Typography variant="caption" sx={{ bgcolor: '#e2e8f0', px: 1, py: 0.5, borderRadius: 1, mt: 1, display: 'inline-block' }}>
                                                {empresa.perfil}
                                            </Typography>
                                        </Box>
                                        {selecting === empresa.tenantId ? <CircularProgress size={24} sx={{ mt: 1 }} /> : <ArrowRight size={20} className="text-gray-400" style={{ marginTop: 8 }} />}
                                    </Box>
                                </Card>
                            </Grid>
                        ))}
                        {empresas.length === 0 && (
                            <Typography color="text.secondary" mt={4}>
                                Nenhuma empresa vinculada.
                            </Typography>
                        )}
                    </Grid>
                )}
            </Container>
        </Box>
    );
};

export default SelecaoEmpresa;