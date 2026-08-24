import { useState, useRef, useEffect } from 'react';
import { Box, Typography, TextField, Paper, Alert, List, ListItem, ListItemText, ListItemIcon, Divider, Button } from '@mui/material';
import { Barcode, ArrowLeft, CheckCircle2, Truck, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { despacharVolume } from '../../services/expedicaoService';

const Checkout = () => {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [codigo, setCodigo] = useState('');
    const [loading, setLoading] = useState(false);

    // Histórico local de bips para feedback visual
    const [historico, setHistorico] = useState([]);

    // Mantém o foco no input sempre
    useEffect(() => {
        const focusInterval = setInterval(() => {
            if (!loading && document.activeElement !== inputRef.current) {
                inputRef.current?.focus();
            }
        }, 2000);
        return () => clearInterval(focusInterval);
    }, [loading]);

    const handleKeyDown = async (e) => {
        if (e.key === 'Enter' && codigo) {
            e.preventDefault();
            await processarDespacho(codigo);
        }
    };

    const processarDespacho = async (codigoLido) => {
        setLoading(true);
        try {
            await despacharVolume(codigoLido);

            // Sucesso
            toast.success(`Volume ${codigoLido} carregado!`);
            addHistorico(codigoLido, 'success');
            setCodigo('');
        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.message || "Erro ao despachar volume.";
            toast.error(msg);
            addHistorico(codigoLido, 'error', msg);

            // Seleciona o texto para facilitar re-bipagem em caso de erro de leitura
            inputRef.current?.select();
        } finally {
            setLoading(false);
            // Pequeno delay para garantir o foco após o toast/render
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    };

    const addHistorico = (cod, status, obs = '') => {
        setHistorico(prev => [
            { id: Date.now(), codigo: cod, status, obs, hora: new Date().toLocaleTimeString() },
            ...prev.slice(0, 9) // Mantém os últimos 10
        ]);
    };

    return (
        <Box maxWidth="md" mx="auto">
            <Button startIcon={<ArrowLeft />} onClick={() => navigate('/expedicao')} sx={{ mb: 2 }}>
                Voltar
            </Button>

            <Typography variant="h5" fontWeight="bold" mb={3} display="flex" alignItems="center" gap={1}>
                <Truck /> Check-out de Expedição
            </Typography>

            <Paper sx={{ p: 4, mb: 4, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" mb={1} color="primary">
                    Bipe a Etiqueta do Volume (Código de Rastreio)
                </Typography>

                <TextField
                    inputRef={inputRef}
                    fullWidth
                    autoFocus
                    placeholder="Ex: VOL-12345678"
                    value={codigo}
                    onChange={e => setCodigo(e.target.value.toUpperCase())}
                    onKeyDown={handleKeyDown}
                    disabled={loading}
                    InputProps={{
                        startAdornment: <Barcode size={24} style={{ marginRight: 12, opacity: 0.5 }} />,
                        style: { fontSize: '1.5rem', padding: 10 }
                    }}
                />

                {loading && <Typography variant="caption" sx={{ mt: 1, display: 'block' }}>Processando...</Typography>}
            </Paper>

            {/* Histórico de Leituras */}
            <Typography variant="h6" fontWeight="bold" mb={2}>Últimos Volumes Lidos</Typography>
            <Paper variant="outlined">
                <List dense>
                    {historico.length === 0 && (
                        <ListItem>
                            <ListItemText primary="Nenhum volume bipado nesta sessão." sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }} />
                        </ListItem>
                    )}
                    {historico.map((item) => (
                        <Box key={item.id}>
                            <ListItem>
                                <ListItemIcon>
                                    {item.status === 'success'
                                        ? <CheckCircle2 color="#16a34a" size={24} />
                                        : <XCircle color="#dc2626" size={24} />
                                    }
                                </ListItemIcon>
                                <ListItemText
                                    primary={<Typography fontWeight="bold" variant="body1">{item.codigo}</Typography>}
                                    secondary={item.status === 'error' ? item.obs : `Carregado às ${item.hora}`}
                                />
                            </ListItem>
                            <Divider component="li" />
                        </Box>
                    ))}
                </List>
            </Paper>
        </Box>
    );
};

export default Checkout;