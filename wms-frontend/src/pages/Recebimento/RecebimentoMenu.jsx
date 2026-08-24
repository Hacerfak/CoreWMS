import { Box, Typography, Grid, Paper, Chip } from '@mui/material';
import { ListChecks, FileInput, AlertTriangle, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Can from '../../components/Can';

const RecebimentoMenu = () => {
    const navigate = useNavigate();

    const sections = [
        {
            title: 'Gestão de Entradas',
            subtitle: 'Controle de notas e importações',
            items: [
                {
                    title: 'Painel de Recebimentos',
                    desc: 'Visão gerencial de todas as notas.',
                    icon: <ListChecks size={32} />,
                    path: '/recebimento/lista',
                    perm: 'RECEBIMENTO_VISUALIZAR',
                    color: '#2563eb'
                }
            ]
        },
        {
            title: 'Operação',
            subtitle: 'Execução de tarefas operacionais',
            items: [
                {
                    title: 'Conferências de entrada',
                    desc: 'Visualizar fila de trabalho e iniciar bipagem.',
                    icon: <ClipboardList size={32} />,
                    path: '/recebimento/tarefas', // <--- Rota Nova
                    perm: 'RECEBIMENTO_CONFERIR',
                    color: '#f59e0b' // Amber/Orange
                }
            ]
        },
        {
            title: 'Qualidade',
            subtitle: 'Tratativa de exceções',
            items: [
                {
                    title: 'Divergências',
                    desc: 'Aprovar ou recusar diferenças.',
                    icon: <AlertTriangle size={32} />,
                    path: '/recebimento/divergencias',
                    perm: 'RECEBIMENTO_FINALIZAR',
                    color: '#dc2626'
                }
            ]
        }
    ];

    return (
        <Box>
            <Box mb={4}>
                <Typography variant="h5" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                    Central de Recebimento
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Gestão de Entradas: NFe, Conferência e Qualidade.
                </Typography>
            </Box>

            {sections.map((section, idx) => (
                <Box key={idx} mb={4}>
                    <Box mb={2} pl={1} borderLeft={4} borderColor="primary.main">
                        <Typography variant="h6" fontWeight="bold" color="text.primary">
                            {section.title}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {section.subtitle}
                        </Typography>
                    </Box>

                    <Grid container spacing={3}>
                        {section.items.map((item, i) => (
                            <Grid item xs={12} md={6} lg={4} key={i}>
                                <Can permissions={item.perm}>
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            p: 3, cursor: 'pointer',
                                            border: '1px solid #e2e8f0', borderRadius: 3,
                                            transition: 'all 0.2s',
                                            '&:hover': {
                                                borderColor: item.color,
                                                transform: 'translateY(-4px)',
                                                boxShadow: `0 10px 20px -5px ${item.color}15`
                                            }
                                        }}
                                        onClick={() => navigate(item.path)}
                                    >
                                        <Box display="flex" alignItems="center" gap={2}>
                                            <Box sx={{
                                                p: 1.5, borderRadius: 2,
                                                bgcolor: `${item.color}10`, color: item.color,
                                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                                            }}>
                                                {item.icon}
                                            </Box>
                                            <Box>
                                                <Typography variant="subtitle1" fontWeight="bold">
                                                    {item.title}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.2 }}>
                                                    {item.desc}
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </Paper>
                                </Can>
                            </Grid>
                        ))}
                    </Grid>
                </Box>
            ))}
        </Box>
    );
};

export default RecebimentoMenu;