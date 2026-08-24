import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, IconButton, CircularProgress, Tooltip
} from '@mui/material';
import { Printer, X, Box as BoxIcon, CheckCircle2, HelpCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import { getVolumesDoItem } from '../../services/recebimentoService';
import PrintModal from '../../components/PrintModal';

const ItemConferenciaModal = ({ open, onClose, recebimentoId, item, exibirQtdEsperada }) => {
    const [volumes, setVolumes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [printOpen, setPrintOpen] = useState(false);
    const [printTargets, setPrintTargets] = useState([]);
    const [printLabel, setPrintLabel] = useState('');

    useEffect(() => {
        if (open && item) loadLpns();
    }, [open, item]);

    const loadLpns = async () => {
        try {
            setLoading(true);
            const data = await getVolumesDoItem(recebimentoId, item.produto.id);
            setVolumes(data);
        } catch (error) { toast.error("Erro ao carregar LPNs"); }
        finally { setLoading(false); }
    };

    const handlePrintAll = () => {
        if (volumes.length === 0) return;
        setPrintTargets(volumes.map(v => v.id));
        setPrintLabel('LOTE_ITEM');
        setPrintOpen(true);
    };

    if (!item) return null;
    const qtdConf = item.quantidadeConferida || 0;
    const qtdNota = item.quantidadePrevista || 0;
    const isCompleto = exibirQtdEsperada && (qtdConf >= qtdNota);

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', bgcolor: '#f8fafc' }}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold">{item.produto.sku}</Typography>
                        <Typography variant="caption">{item.produto.nome}</Typography>
                    </Box>
                    <IconButton onClick={onClose}><X size={20} /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Box sx={{ p: 2, mb: 2, borderRadius: 2, bgcolor: isCompleto ? '#dcfce7' : '#eff6ff', border: '1px solid', borderColor: isCompleto ? '#86efac' : '#bfdbfe' }}>
                        <Box display="flex" justifyContent="space-between">
                            <Typography fontWeight="bold">{isCompleto ? "Conferência Concluída" : "Em Andamento"}</Typography>
                            <Typography variant="h6">{qtdConf} {exibirQtdEsperada && `/ ${qtdNota}`}</Typography>
                        </Box>
                    </Box>
                    <Box display="flex" justifyContent="space-between" mb={2}>
                        <Typography variant="subtitle2" fontWeight="bold">Etiquetas ({volumes.length})</Typography>
                        {volumes.length > 0 && <Button size="small" variant="outlined" startIcon={<Printer size={16} />} onClick={handlePrintAll}>Imprimir Todas</Button>}
                    </Box>
                    {loading ? <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box> : (
                        <TableContainer sx={{ maxHeight: 300, border: '1px solid #e2e8f0' }}>
                            <Table size="small" stickyHeader>
                                <TableHead><TableRow><TableCell>LPN</TableCell><TableCell align="right">Qtd</TableCell></TableRow></TableHead>
                                <TableBody>
                                    {volumes.map(v => (
                                        <TableRow key={v.id}><TableCell>{v.codigo}</TableCell><TableCell align="right">{v.itens?.[0]?.quantidade}</TableCell></TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}><Button onClick={onClose} fullWidth>Fechar</Button></DialogActions>
            </Dialog>
            <PrintModal open={printOpen} onClose={() => setPrintOpen(false)} lpnIds={printTargets} lpnCodigoLabel={printLabel} />
        </>
    );
};
export default ItemConferenciaModal;