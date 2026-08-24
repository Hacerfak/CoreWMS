import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, MenuItem, TextField } from '@mui/material';
import { toast } from 'react-toastify';
import { getLocalizacoes } from '../../../services/localizacaoService';
import { atribuirDoca } from '../../../services/recebimentoService';

const AtribuirDocaModal = ({ open, onClose, solicitacao, onSuccess }) => {
    const [docas, setDocas] = useState([]);
    const [selectedDoca, setSelectedDoca] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            loadDocas();
            // Pré-seleciona se já tiver doca
            setSelectedDoca(solicitacao?.docaId || '');
        }
    }, [open, solicitacao]);

    const loadDocas = async () => {
        try {
            const data = await getLocalizacoes('DOCA');
            setDocas(data);
        } catch (error) {
            console.error(error);
        }
    };

    const handleSave = async () => {
        if (!selectedDoca) return toast.warning("Selecione uma doca.");

        setLoading(true);
        try {
            await atribuirDoca(solicitacao.id, selectedDoca);
            toast.success("Doca atribuída com sucesso!");
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            toast.error("Erro ao atribuir doca.");
        } finally {
            setLoading(false);
        }
    };

    // Helper para exibição amigável
    const formatDocaLabel = (d) => {
        // Se tiver descrição (nome curto), usa. Senão usa o endereço completo.
        const nome = d.descricao || d.enderecoCompleto;
        const status = d.status === 'OCUPADO' ? ' (Ocupada)' : '';
        return nome + status;
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Atribuir Doca</DialogTitle>
            <DialogContent>
                <TextField
                    select
                    label="Selecione a Doca"
                    fullWidth
                    margin="dense"
                    value={selectedDoca}
                    onChange={(e) => setSelectedDoca(e.target.value)}
                >
                    {docas.map((d) => (
                        <MenuItem key={d.id} value={d.id}>
                            {formatDocaLabel(d)}
                        </MenuItem>
                    ))}
                </TextField>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancelar</Button>
                <Button onClick={handleSave} variant="contained" disabled={loading}>
                    Confirmar
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default AtribuirDocaModal;