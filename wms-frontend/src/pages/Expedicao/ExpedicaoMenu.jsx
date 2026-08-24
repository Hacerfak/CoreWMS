import { Box, Typography, Grid, Paper, Button } from '@mui/material';
import { Truck, ClipboardCheck, PackageCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Can from '../../components/Can';

const ExpedicaoMenu = () => {
    const navigate = useNavigate();

    const menuItems = [
        {
            title: 'Conferência de Expedição (Check-out)',
            desc: 'Bipar volumes na doca para confirmar carregamento.',
            icon: <Truck size={40} />,
            path: '/expedicao/checkout',
            perm: 'EXPEDICAO_DESPACHAR',
            color: '#16a34a' // Green
        },
        {
            title: 'Separação (Picking)',
            desc: 'Realizar tarefas de separação de ondas.',
            icon: <ClipboardCheck size={40} />,
            path: '/expedicao/picking', // Rota futura
            perm: 'EXPEDICAO_SEPARAR',
            color: '#2563eb', // Blue
            disabled: true // Ainda não implementamos a tela visual, apenas backend
        }
    ];

    return (
        <Box>
            <Typography variant="h5" fontWeight="bold" mb={3} display="flex" alignItems="center" gap={1}>
                <PackageCheck size={28} /> Expedição
            </Typography>

            <Grid container spacing={3}>
                {menuItems.map((item, index) => (
                    <Grid item xs={12} md={6} key={index}>
                        <Can I={item.perm} elseShow={null}>
                            <Paper
                                sx={{
                                    p: 4, cursor: item.disabled ? 'default' : 'pointer',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 2,
                                    transition: '0.2s',
                                    opacity: item.disabled ? 0.6 : 1,
                                    '&:hover': !item.disabled && {
                                        borderColor: item.color,
                                        transform: 'translateY(-2px)',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                    }
                                }}
                                onClick={() => !item.disabled && navigate(item.path)}
                            >
                                <Box display="flex" alignItems="center" gap={3}>
                                    <Box sx={{
                                        p: 2, borderRadius: 2,
                                        bgcolor: `${item.color}15`,
                                        color: item.color
                                    }}>
                                        {item.icon}
                                    </Box>
                                    <Box>
                                        <Typography variant="h6" fontWeight="bold" color={item.disabled ? 'text.secondary' : 'text.primary'}>
                                            {item.title} {item.disabled && "(Em Breve)"}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
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
    );
};

export default ExpedicaoMenu;