import { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Button, List, ListItem,
    ListItemText, Chip, IconButton, Alert, LinearProgress, Divider
} from '@mui/material';
import { ArrowLeft, PlayCircle, Clock, Truck, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../services/api'; // Usando axios direto para a rota customizada

const TarefasRecebimentoList = () => {
    const navigate = useNavigate();
    const [tarefas, setTarefas] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadTarefas();
    }, []);

    const loadTarefas = async () => {
        setLoading(true);
        try {
            // Chama o endpoint que criamos/validamos no controller
            const response = await api.get('/api/recebimentos/tarefas/pendentes');
            setTarefas(response.data);
        } catch (error) {
            toast.error("Erro ao carregar tarefas.");
        } finally {
            setLoading(false);
        }
    };

    const handleIniciar = async (tarefa) => {
        try {
            // Opcional: Marcar tarefa como "EM EXECUÇÃO" antes de ir
            // await api.post(`/api/recebimentos/tarefas/${tarefa.id}/iniciar`);

            // Navega para a tela de conferência passando o ID da Solicitação
            // (A tela de conferência atual usa o ID da solicitação)
            const solicitacaoId = tarefa.solicitacaoPai?.id;
            navigate(`/recebimento/${solicitacaoId}/conferencia`);
        } catch (e) {
            toast.error("Erro ao iniciar tarefa.");
        }
    };

    return (
        <Box maxWidth="md" mx="auto">
            <Box display="flex" alignItems="center" gap={2} mb={3}>
                <Button startIcon={<ArrowLeft />} onClick={() => navigate('/recebimento')} color="inherit">
                    Voltar
                </Button>
                <Typography variant="h5" fontWeight="bold">
                    Fila de Conferência
                </Typography>
            </Box>

            {loading && <LinearProgress sx={{ mb: 2 }} />}

            {!loading && tarefas.length === 0 && (
                <Alert severity="success" sx={{ mt: 2 }}>
                    Nenhuma conferência pendente no momento!
                </Alert>
            )}

            <Paper variant="outlined" sx={{ borderRadius: 2 }}>
                <List sx={{ p: 0 }}>
                    {tarefas.map((tarefa, index) => (
                        <Box key={tarefa.id}>
                            <ListItem
                                sx={{
                                    flexDirection: { xs: 'column', sm: 'row' },
                                    alignItems: { xs: 'flex-start', sm: 'center' },
                                    gap: 2,
                                    py: 2
                                }}
                            >
                                <Box flex={1}>
                                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                        <Chip
                                            label={`Tarefa #${tarefa.id}`}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            sx={{ fontWeight: 'bold' }}
                                        />
                                        <Typography variant="caption" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                                            <Clock size={14} /> {new Date(tarefa.dataCriacao).toLocaleDateString()}
                                        </Typography>
                                    </Box>

                                    <Typography variant="h6" fontWeight="600">
                                        {tarefa.solicitacaoPai?.fornecedor?.nome || 'Fornecedor Desconhecido'}
                                    </Typography>

                                    <Box display="flex" gap={2} mt={1} color="text.secondary">
                                        <Typography variant="body2" display="flex" alignItems="center" gap={0.5}>
                                            <FileText size={16} /> NF: <b>{tarefa.solicitacaoPai?.notaFiscal}</b>
                                        </Typography>
                                        <Typography variant="body2" display="flex" alignItems="center" gap={0.5}>
                                            <Truck size={16} /> Cód: {tarefa.solicitacaoPai?.codigoExterno}
                                        </Typography>
                                    </Box>
                                </Box>

                                <Button
                                    variant="contained"
                                    color="success"
                                    size="large"
                                    startIcon={<PlayCircle />}
                                    onClick={() => handleIniciar(tarefa)}
                                    sx={{ minWidth: 140 }}
                                >
                                    Conferir
                                </Button>
                            </ListItem>
                            {index < tarefas.length - 1 && <Divider />}
                        </Box>
                    ))}
                </List>
            </Paper>
        </Box>
    );
};

export default TarefasRecebimentoList;