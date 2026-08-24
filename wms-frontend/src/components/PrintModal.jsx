import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, MenuItem, TextField, CircularProgress, Alert, Box, Typography
} from '@mui/material';
import { Printer } from 'lucide-react';
import { toast } from 'react-toastify';
import { getImpressorasAtivas, getTemplates, imprimirLpn } from '../services/printHubService';

const PrintModal = ({ open, onClose, lpnIds = [], lpnCodigoLabel }) => {
    const [impressoras, setImpressoras] = useState([]);
    const [templates, setTemplates] = useState([]);

    const [selectedPrinter, setSelectedPrinter] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState('');

    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    // Garante que lpnIds seja sempre um array
    const targets = Array.isArray(lpnIds) ? lpnIds : [lpnIds];
    const isBatch = targets.length > 1;

    useEffect(() => {
        if (open) {
            loadDependencies();
        }
    }, [open]);

    const loadDependencies = async () => {
        setLoading(true);
        try {
            const [imps, tmpls] = await Promise.all([
                getImpressorasAtivas(),
                getTemplates()
            ]);

            setImpressoras(imps);
            // Filtra templates que são de LPN
            setTemplates(tmpls.filter(t => t.tipoFinalidade === 'LPN'));

            // Auto-seleção inteligente da primeira impressora
            if (imps.length > 0) setSelectedPrinter(imps[0].id);

            // Tenta achar o template padrão
            const defaultTmpl = tmpls.find(t => t.padrao && t.tipoFinalidade === 'LPN');
            if (defaultTmpl) setSelectedTemplate(defaultTmpl.id);
            else if (tmpls.length > 0) setSelectedTemplate(tmpls[0].id);

        } catch (error) {
            toast.error("Erro ao carregar configurações de impressão.");
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = async () => {
        if (!selectedPrinter) return;
        setSending(true);
        try {
            // Dispara as impressões em paralelo
            const promises = targets.map(id =>
                imprimirLpn(id, selectedPrinter, selectedTemplate || null)
            );

            await Promise.all(promises);

            toast.success(isBatch ? `${targets.length} etiquetas enviadas!` : "Impressão enviada!");
            onClose();
        } catch (error) {
            toast.error("Erro ao solicitar impressão. Verifique o Hub.");
            console.error(error);
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle display="flex" alignItems="center" gap={1}>
                <Printer size={20} /> {isBatch ? 'Impressão em Lote' : 'Imprimir Etiqueta'}
            </DialogTitle>

            <DialogContent dividers>
                {loading ? (
                    <Box display="flex" justifyContent="center" p={2}><CircularProgress /></Box>
                ) : impressoras.length === 0 ? (
                    <Alert severity="warning">Nenhuma impressora ativa encontrada.</Alert>
                ) : (
                    <Box display="flex" flexDirection="column" gap={3} pt={1}>

                        {!isBatch ? (
                            <Typography variant="body1">
                                Imprimir etiqueta para: <strong>{lpnCodigoLabel}</strong>
                            </Typography>
                        ) : (
                            <Alert severity="info" icon={<Printer size={18} />}>
                                Você vai imprimir <strong>{targets.length} etiquetas</strong> de uma vez.
                            </Alert>
                        )}

                        <TextField
                            select
                            label="Selecione a Impressora"
                            fullWidth
                            value={selectedPrinter}
                            onChange={(e) => setSelectedPrinter(e.target.value)}
                            disabled={sending}
                        >
                            {impressoras.map((imp) => (
                                <MenuItem key={imp.id} value={imp.id}>
                                    {imp.nome} ({imp.tipoConexao})
                                </MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            select
                            label="Modelo de Etiqueta"
                            fullWidth
                            value={selectedTemplate}
                            onChange={(e) => setSelectedTemplate(e.target.value)}
                            disabled={sending}
                            helperText="Se vazio, usa o padrão do sistema."
                        >
                            <MenuItem value=""><em>Padrão do Sistema</em></MenuItem>
                            {templates.map((t) => (
                                <MenuItem key={t.id} value={t.id}>
                                    {t.nome} ({t.larguraMm}x{t.alturaMm}mm)
                                </MenuItem>
                            ))}
                        </TextField>
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} disabled={sending}>Cancelar</Button>
                <Button
                    onClick={handlePrint}
                    variant="contained"
                    color="primary"
                    disabled={sending || impressoras.length === 0 || !selectedPrinter}
                    startIcon={sending ? <CircularProgress size={16} color="inherit" /> : <Printer size={18} />}
                >
                    {sending ? "Enviando..." : "Imprimir"}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default PrintModal;