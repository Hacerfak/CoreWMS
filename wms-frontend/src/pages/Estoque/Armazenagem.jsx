import { useState, useRef } from 'react';
import { Box, Typography, TextField, Button, Paper, Alert, Grid, Divider } from '@mui/material';
import { QrCode, MapPin, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import { toast } from 'react-toastify';
import { buscarLocalPorCodigo } from '../../services/mapeamentoService';
import { armazenarLpn } from '../../services/estoqueService';

const Armazenagem = () => {
    // Refs para controle de foco automático
    const lpnInputRef = useRef(null);
    const localInputRef = useRef(null);

    const [etapa, setEtapa] = useState(1); // 1 = LPN, 2 = Local, 3 = Sucesso
    const [lpn, setLpn] = useState('');
    const [localCodigo, setLocalCodigo] = useState('');
    const [localId, setLocalId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [ultimoMovimento, setUltimoMovimento] = useState(null);

    // Handler para o LPN (Enter)
    const handleLpnKeyDown = (e) => {
        if (e.key === 'Enter' && lpn) {
            e.preventDefault();
            setEtapa(2);
            // Pequeno delay para o DOM atualizar e permitir o foco
            setTimeout(() => localInputRef.current?.focus(), 100);
        }
    };

    // Handler para o Local (Enter)
    const handleLocalKeyDown = async (e) => {
        if (e.key === 'Enter' && localCodigo) {
            e.preventDefault();
            await processarArmazenagem();
        }
    };

    const processarArmazenagem = async () => {
        if (!lpn || !localCodigo) return;
        setLoading(true);

        try {
            // 1. Busca o ID do Local pelo Código de Barras
            const localData = await buscarLocalPorCodigo(localCodigo);
            setLocalId(localData.id);

            // 2. Envia para o Backend realizar a movimentação
            await armazenarLpn(lpn, localData.id);

            // 3. Sucesso
            toast.success("Armazenado com sucesso!");
            setUltimoMovimento({ lpn, local: localCodigo });
            resetarProcesso();

        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.message || "Erro ao armazenar.";
            toast.error(msg);
            // Se erro for de local, foca no local, se for LPN, volta pro inicio
            if (msg.toLowerCase().includes("local") || msg.toLowerCase().includes("endereço")) {
                localInputRef.current?.select();
            } else {
                setLpn('');
                setEtapa(1);
                lpnInputRef.current?.focus();
            }
        } finally {
            setLoading(false);
        }
    };

    const resetarProcesso = () => {
        setLpn('');
        setLocalCodigo('');
        setLocalId(null);
        setEtapa(1);
        setTimeout(() => lpnInputRef.current?.focus(), 100);
    };

    return (
        <Box maxWidth="sm" mx="auto" mt={4}>
            <Typography variant="h5" fontWeight="bold" mb={3} textAlign="center">
                Armazenagem (Put-away)
            </Typography>

            <Paper sx={{ p: 4, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>

                {/* Passo 1: LPN */}
                <Box mb={3} sx={{ opacity: etapa === 1 ? 1 : 0.5, pointerEvents: etapa === 1 ? 'auto' : 'none' }}>
                    <Typography variant="subtitle2" fontWeight="bold" color="primary" mb={1} display="flex" alignItems="center" gap={1}>
                        1. Bipe a Etiqueta (LPN)
                    </Typography>
                    <TextField
                        inputRef={lpnInputRef}
                        fullWidth
                        value={lpn}
                        onChange={e => setLpn(e.target.value.toUpperCase())}
                        onKeyDown={handleLpnKeyDown}
                        placeholder="Ex: RU123..."
                        InputProps={{
                            startAdornment: <QrCode size={20} style={{ marginRight: 10, opacity: 0.5 }} />
                        }}
                        autoFocus
                    />
                </Box>

                <Box display="flex" justifyContent="center" my={2}>
                    <ArrowRight size={24} color="#cbd5e1" />
                </Box>

                {/* Passo 2: Local */}
                <Box mb={4} sx={{ opacity: etapa >= 2 ? 1 : 0.5, pointerEvents: etapa === 2 ? 'auto' : 'none' }}>
                    <Typography variant="subtitle2" fontWeight="bold" color="primary" mb={1} display="flex" alignItems="center" gap={1}>
                        2. Bipe o Endereço de Destino
                    </Typography>
                    <TextField
                        inputRef={localInputRef}
                        fullWidth
                        value={localCodigo}
                        onChange={e => setLocalCodigo(e.target.value.toUpperCase())}
                        onKeyDown={handleLocalKeyDown}
                        placeholder="Ex: CD01-RUA-01..."
                        disabled={etapa < 2}
                        InputProps={{
                            startAdornment: <MapPin size={20} style={{ marginRight: 10, opacity: 0.5 }} />
                        }}
                    />
                </Box>

                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={processarArmazenagem}
                    disabled={etapa !== 2 || loading}
                    sx={{ py: 1.5, fontSize: '1.1rem' }}
                >
                    {loading ? "Processando..." : "Confirmar Armazenagem"}
                </Button>

                {etapa > 1 && (
                    <Button
                        variant="text"
                        fullWidth
                        startIcon={<RotateCcw size={16} />}
                        onClick={resetarProcesso}
                        sx={{ mt: 2 }}
                    >
                        Reiniciar
                    </Button>
                )}
            </Paper>

            {/* Feedback do Último Movimento */}
            {ultimoMovimento && (
                <Alert
                    icon={<CheckCircle2 fontSize="inherit" />}
                    severity="success"
                    sx={{ mt: 3, border: '1px solid #bbf7d0' }}
                >
                    <strong>Último Sucesso:</strong> LPN {ultimoMovimento.lpn} armazenado em {ultimoMovimento.local}
                </Alert>
            )}
        </Box>
    );
};

export default Armazenagem;