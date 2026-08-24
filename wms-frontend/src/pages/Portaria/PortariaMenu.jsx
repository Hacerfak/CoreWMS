import { Box, Typography, Grid, Paper, Divider, Chip } from '@mui/material';
import { CalendarClock, Truck, Settings2, FileInput, Construction } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Can from '../../components/Can';

const PortariaMenu = () => {
    const navigate = useNavigate();

    // Definição das Seções
    const sections = [
        {
            title: 'Agendamentos',
            subtitle: 'Rotinas de agendamento',
            items: [
                /*{
                    title: 'Criar agendamento (Rápido)',
                    desc: 'Importar NFe para criar agendamento de entrada.',
                    icon: <FileInput size={32} />,
                    path: '/portaria/vinculo-xml',
                    perm: 'RECEBIMENTO_IMPORTAR_XML',
                    color: '#7c3aed' // Violet
                },*/
                {
                    title: 'Agendamento de Entrada e Saída',
                    desc: 'Visualizar e criar agendamentos.',
                    icon: <CalendarClock size={32} />,
                    path: '/portaria/agenda',
                    perm: 'PORTARIA_AGENDAR',
                    color: '#2563eb' // Blue
                }
            ]
        },
        {
            title: 'Operação Diária',
            subtitle: 'Controle de acessos',
            items: [
                {
                    title: 'Portaria',
                    desc: 'Check-in e Check-out de veículos.',
                    icon: <Construction size={32} />,
                    path: '/portaria/operacao',
                    perm: 'PORTARIA_OPERAR',
                    color: '#16a34a' // Green
                }
            ]
        },
        {
            title: 'Gestão & Configuração',
            subtitle: 'Cadastros básicos e regras de portaria',
            items: [
                {
                    title: 'Gestão de Turnos',
                    desc: 'Configurar janelas de tempo e dias.',
                    icon: <Settings2 size={32} />,
                    path: '/portaria/turnos',
                    perm: 'PORTARIA_GERENCIAR',
                    color: '#d97706' // Amber
                }
            ]
        }
    ];

    return (
        <Box>
            <Box mb={4}>
                <Typography variant="h5" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                    <Truck size={28} /> Central de Portaria
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Gestão de pátio, agenda e controle de acesso.
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
                                <Can permissions={item.perm} elseShow={null}>
                                    <Paper
                                        elevation={0}
                                        sx={{
                                            p: 3, cursor: 'pointer',
                                            border: '1px solid #e2e8f0', borderRadius: 3,
                                            position: 'relative', overflow: 'hidden',
                                            transition: 'all 0.2s ease-in-out',
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
                                                bgcolor: `${item.color}10`,
                                                color: item.color,
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

export default PortariaMenu;