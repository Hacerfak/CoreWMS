import { useState, useEffect, useContext } from 'react';
import {
    Box, Grid, Paper, Typography, LinearProgress, Divider,
    List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip, Alert
} from '@mui/material';
import {
    TrendingUp, AlertTriangle, Package, CalendarClock,
    ClipboardCheck, PieChart
} from 'lucide-react';
import { getOcupacao, getAging, getAcuracidade } from '../../services/relatorioService';
import { AuthContext } from '../../contexts/AuthContext';

const Dashboard = () => {
    const { user } = useContext(AuthContext);

    const [ocupacao, setOcupacao] = useState([]);
    const [aging, setAging] = useState([]);
    const [acuracidade, setAcuracidade] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadIndicadores();
    }, []);

    const loadIndicadores = async () => {
        try {
            // Carrega tudo em paralelo
            const [ocupData, agingData, acurData] = await Promise.all([
                getOcupacao(),
                getAging(30), // Vencendo em 30 dias
                getAcuracidade()
            ]);

            setOcupacao(ocupData);
            setAging(agingData);
            // Pega o inventário mais recente para exibir a acuracidade
            if (acurData && acurData.length > 0) {
                setAcuracidade(acurData[0]);
            }
        } catch (error) {
            console.error("Erro ao carregar dashboard", error);
        } finally {
            setLoading(false);
        }
    };

    // Helper para cor da barra de ocupação
    const getProgressColor = (valor) => {
        if (valor > 90) return 'error';
        if (valor > 75) return 'warning';
        return 'success';
    };

    return (
        <Box p={3}>
            <Box mb={4}>
                <Typography variant="h4" fontWeight="bold" gutterBottom>
                    Olá, {user?.nome || 'Usuário'}!
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Visão geral da sua operação!
                </Typography>
            </Box>

            <Grid container spacing={3}>

                {/* --- OCUPAÇÃO DO ARMAZÉM --- */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 3, height: '100%' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={3}>
                            <PieChart size={24} color="#2563eb" />
                            <Typography variant="h6" fontWeight="bold">Ocupação Física</Typography>
                        </Box>

                        {ocupacao.length === 0 && !loading && (
                            <Alert severity="info">Nenhuma estrutura de armazenagem mapeada.</Alert>
                        )}

                        <Grid container spacing={4}>
                            {ocupacao.map((area, index) => (
                                <Grid item xs={12} sm={6} key={index}>
                                    <Box mb={1} display="flex" justifyContent="space-between">
                                        <Typography fontWeight="500">{area.area} ({area.tipoEstrutura})</Typography>
                                        <Typography fontWeight="bold">{(area.taxaOcupacaoReal * 100).toFixed(1)}%</Typography>
                                    </Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={area.taxaOcupacaoReal * 100}
                                        color={getProgressColor(area.taxaOcupacaoReal * 100)}
                                        sx={{ height: 10, borderRadius: 5 }}
                                    />
                                    <Typography variant="caption" color="text.secondary" mt={0.5} display="block">
                                        {area.palletsFisicos} pallets de {area.capacidadePalletsReal} posições
                                    </Typography>
                                </Grid>
                            ))}
                        </Grid>
                    </Paper>
                </Grid>

                {/* --- KPI ACURACIDADE --- */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, height: '100%', bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                            <ClipboardCheck size={24} color="#059669" />
                            <Typography variant="h6" fontWeight="bold" color="text.primary">Acuracidade</Typography>
                        </Box>

                        {acuracidade ? (
                            <Box textAlign="center" py={2}>
                                <Typography variant="h2" fontWeight="bold" color={acuracidade.acuracidadePercentual >= 98 ? 'success.main' : 'warning.main'}>
                                    {acuracidade.acuracidadePercentual}%
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Último Inventário: {new Date(acuracidade.data).toLocaleDateString()}
                                </Typography>
                                <Chip
                                    label={`${acuracidade.contagensCorretas} Corretas / ${acuracidade.totalContagens} Total`}
                                    sx={{ mt: 2 }}
                                    size="small"
                                />
                            </Box>
                        ) : (
                            <Box textAlign="center" py={4}>
                                <Typography color="text.secondary">Sem dados de inventário recente.</Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>

                {/* --- AGING (RISCO DE VENCIMENTO) --- */}
                <Grid item xs={12}>
                    <Paper sx={{ p: 3 }}>
                        <Box display="flex" alignItems="center" gap={1} mb={2}>
                            <CalendarClock size={24} color="#dc2626" />
                            <Typography variant="h6" fontWeight="bold">Risco de Vencimento (Próx. 30 dias)</Typography>
                        </Box>

                        {aging.length === 0 ? (
                            <Alert severity="success">Nenhum produto próximo do vencimento!</Alert>
                        ) : (
                            <List>
                                {aging.slice(0, 5).map((item, idx) => (
                                    <div key={idx}>
                                        <ListItem>
                                            <ListItemAvatar>
                                                <Avatar sx={{ bgcolor: 'error.light', color: 'error.main' }}>
                                                    <AlertTriangle size={20} />
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                primary={
                                                    <Typography fontWeight="bold">
                                                        {item.sku} - {item.descricao}
                                                    </Typography>
                                                }
                                                secondary={`Lote: ${item.lote} | Vence em: ${new Date(item.dataValidade).toLocaleDateString()}`}
                                            />
                                            <Chip label={`${item.diasParaVencer} dias`} color="error" size="small" />
                                        </ListItem>
                                        <Divider variant="inset" component="li" />
                                    </div>
                                ))}
                            </List>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Dashboard;