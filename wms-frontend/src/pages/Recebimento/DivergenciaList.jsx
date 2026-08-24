import { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Button, Chip, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert
} from '@mui/material';
import { CheckCircle, XCircle, ArrowLeft, RefreshCw, AlertTriangle } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { getDivergenciasPendentes, resolverDivergencia } from '../../services/recebimentoService';

const DivergenciaList = () => {
    const navigate = useNavigate();
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(false);

    // Modal
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null); // A divergência sendo tratada
    const [acao, setAcao] = useState(true); // true = Aceitar, false = Recusar
    const [obs, setObs] = useState('');

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getDivergenciasPendentes();
            setLista(data);
        } catch (e) {
            toast.error("Erro ao carregar divergências.");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenResolve = (item, isAceitar) => {
        setSelectedItem(item);
        setAcao(isAceitar);
        setObs('');
        setModalOpen(true);
    };

    const confirmResolve = async () => {
        if (!obs) return toast.warning("Informe uma observação/justificativa.");
        try {
            await resolverDivergencia(selectedItem.id, acao, obs);
            toast.success("Divergência resolvida!");
            setModalOpen(false);
            load();
        } catch (e) {
            toast.error("Erro ao resolver.");
        }
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/recebimento')} color="inherit">
                        Voltar
                    </Button>
                    <Typography variant="h5" fontWeight="bold">Gestão de Divergências</Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={load}>Atualizar</Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
                <Table>
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                            <TableCell>Nota Fiscal</TableCell>
                            <TableCell>Produto</TableCell>
                            <TableCell>Tipo</TableCell>
                            <TableCell align="right">Diferença</TableCell>
                            <TableCell align="center">Ações</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {lista.length === 0 ? (
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nenhuma divergência pendente.</TableCell></TableRow>
                        ) : (
                            lista.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold">{d.solicitacao?.codigoExterno}</Typography>
                                        <Typography variant="caption">{d.solicitacao?.fornecedor?.nome}</Typography>
                                    </TableCell>
                                    <TableCell>{d.produto?.sku} - {d.produto?.nome}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={d.tipo}
                                            color={d.tipo === 'SOBRA_FISICA' ? 'warning' : 'error'}
                                            size="small"
                                            icon={<AlertTriangle size={14} />}
                                        />
                                    </TableCell>
                                    <TableCell align="right">
                                        <b>{d.quantidadeDivergente}</b> {d.produto?.unidadeMedida}
                                    </TableCell>
                                    <TableCell align="center">
                                        <Box display="flex" justifyContent="center" gap={1}>
                                            <Button
                                                size="small" variant="contained" color="success"
                                                startIcon={<CheckCircle size={16} />}
                                                onClick={() => handleOpenResolve(d, true)}
                                            >
                                                Aceitar
                                            </Button>
                                            <Button
                                                size="small" variant="outlined" color="error"
                                                startIcon={<XCircle size={16} />}
                                                onClick={() => handleOpenResolve(d, false)}
                                            >
                                                Recusar
                                            </Button>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {acao ? 'Aceitar Divergência' : 'Registrar Disputa/Recusa'}
                </DialogTitle>
                <DialogContent>
                    <Alert severity={acao ? 'info' : 'warning'} sx={{ mb: 2 }}>
                        {acao
                            ? "Ao aceitar, o sistema assume a contagem física como correta e atualiza o estoque."
                            : "Ao recusar, a nota será liberada mas ficará registrada a pendência comercial."}
                    </Alert>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Observação / Justificativa"
                        fullWidth
                        multiline
                        rows={3}
                        value={obs}
                        onChange={(e) => setObs(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button onClick={confirmResolve} variant="contained" color={acao ? 'success' : 'error'}>
                        Confirmar
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default DivergenciaList;