import { useEffect } from 'react';
import { Box, Card, Typography, Grid, Button, CircularProgress, Avatar, Container } from '@mui/material';
import { Building2, LogOut, ArrowRight, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';

const SelecaoEmpresa = () => {
    const navigate = useNavigate();
    const { user, setCompanyId, logout, setEmpresas } = useAuthStore();

    const { data: companies, isLoading } = useQuery({
        queryKey: ['my-companies'],
        queryFn: async () => {
            const { data } = await api.get('/api/companies');
            return data || [];
        }
    });

    useEffect(() => {
        if (companies) {
            setEmpresas(companies);
            // Se o usuário não tem nenhuma empresa, manda pro Onboarding (em breve)
            if (companies.length === 0) navigate('/onboarding', { replace: true });
        }
    }, [companies, navigate, setEmpresas]);

    const handleSelect = (tenantId) => {
        setCompanyId(tenantId);
        navigate('/dashboard');
    };

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ bgcolor: 'white', py: 2, px: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 1 }}>
                <Typography variant="h6" fontWeight="bold" color="primary">CoreWMS</Typography>
                <Box display="flex" gap={2}>
                    {user?.role === 'ADMIN' && (
                        <Button variant="contained" size="small" startIcon={<Plus size={18} />} onClick={() => navigate('/onboarding')}>
                            Nova Empresa
                        </Button>
                    )}
                    <Button startIcon={<LogOut size={18} />} color="inherit" onClick={handleLogout}>Sair</Button>
                </Box>
            </Box>
            <Container maxWidth="md" sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', py: 4 }}>
                <Box mb={4} textAlign="center">
                    <Typography variant="h4" fontWeight="bold" color="#1e293b" gutterBottom>Bem-vindo, {user?.nome}</Typography>
                    <Typography variant="body1" color="text.secondary">Selecione o ambiente que deseja acessar.</Typography>
                </Box>
                {isLoading ? (
                    <Box display="flex" justifyContent="center" mt={4}><CircularProgress /></Box>
                ) : (
                    <Grid container spacing={3} justifyContent="center">
                        {companies?.map((empresa) => (
                            <Grid item xs={12} sm={6} md={4} key={empresa.id}>
                                <Card
                                    onClick={() => handleSelect(empresa.id)}
                                    sx={{
                                        p: 3, cursor: 'pointer', transition: '0.2s', border: '1px solid transparent',
                                        '&:hover': { transform: 'translateY(-4px)', boxShadow: 4, borderColor: 'primary.main' }
                                    }}
                                >
                                    <Box display="flex" flexDirection="column" alignItems="center" textAlign="center" gap={2}>
                                        <Avatar sx={{ width: 56, height: 56, bgcolor: 'primary.light', color: 'primary.main' }}>
                                            <Building2 size={28} />
                                        </Avatar>
                                        <Box>
                                            <Typography variant="h6" fontWeight="bold" noWrap>{empresa.corporateName}</Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">CNPJ: {empresa.cnpj}</Typography>
                                        </Box>
                                        <ArrowRight size={20} color="#94a3b8" style={{ marginTop: 8 }} />
                                    </Box>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </Container>
        </Box>
    );
};

export default SelecaoEmpresa;