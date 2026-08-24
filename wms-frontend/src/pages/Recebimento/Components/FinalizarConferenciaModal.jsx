import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, MenuItem, TextField, Typography, Alert, Box, CircularProgress
} from '@mui/material';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { getLocalizacoes } from '../../../services/localizacaoService';
import { finalizarConferencia } from '../../../services/recebimentoService';

const FinalizarConferenciaModal = ({ open, onClose, recebimentoId, onSucesso }) => {
    const [stages, setStages] = useState([]);
    const [selectedStage, setSelectedStage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            loadStages();
        }
    }, [open]);

    const loadStages = async () => {
        setLoading(true);
        try {
            // Busca apenas locais do tipo STAGE
            const data = await getLocalizacoes('STAGE');
            setStages(data);

            // Auto-seleciona se tiver apenas um
            if (data.length === 1) {
                setSelectedStage(data[0].id);
            }
        } catch (error) {
            toast.error("Erro ao carregar locais de Stage.");
        } finally {
            setLoading(false);
        }
    };

    const handleConfirm = async () => {
        if (!selectedStage) return toast.warning("Selecione um local de destino (Stage).");

        setSubmitting(true);
        try {
            await finalizarConferencia(recebimentoId, selectedStage);
            toast.success("Conferência finalizada com sucesso!");
            if (onSucesso) onSucesso();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error(error.response?.data?.message || "Erro ao finalizar.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle display="flex" alignItems="center" gap={1}>
                <CheckCircle color="#16a34a" /> Finalizar Recebimento
            </DialogTitle>

            <DialogContent dividers>
                <Alert severity="info" sx={{ mb: 3 }}>
                    Ao finalizar, todo o estoque conferido será movido da <b>Doca</b> para o <b>Stage</b> selecionado, liberando a porta para o próximo veículo.
                </Alert>

                {loading ? (
                    <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box>
                ) : (
                    <>
                        <Typography variant="subtitle2" gutterBottom>
                            Destino do Material (Stage / Pulmão de Entrada)
                        </Typography>

                        <TextField
                            select
                            label="Selecione o Stage"
                            fullWidth
                            value={selectedStage}
                            onChange={(e) => setSelectedStage(e.target.value)}
                            helperText={stages.length === 0 ? "Nenhum local do tipo 'STAGE' encontrado." : "Local onde os pallets aguardarão armazenamento."}
                            error={stages.length === 0}
                        >
                            {stages.map((loc) => (
                                <MenuItem key={loc.id} value={loc.id}>
                                    {loc.codigo} - {loc.descricao || 'Sem descrição'}
                                </MenuItem>
                            ))}
                        </TextField>

                        {stages.length === 0 && (
                            <Button
                                color="primary"
                                variant="text"
                                size="small"
                                sx={{ mt: 1 }}
                                onClick={() => window.open('/cadastros/locais', '_blank')}
                            >
                                Cadastrar Local de Stage
                            </Button>
                        )}
                    </>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} disabled={submitting} color="inherit">
                    Cancelar
                </Button>
                <Button
                    onClick={handleConfirm}
                    variant="contained"
                    color="success"
                    disabled={submitting || !selectedStage}
                    startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <CheckCircle size={18} />}
                >
                    {submitting ? "Finalizando..." : "Confirmar Finalização"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default FinalizarConferenciaModal;