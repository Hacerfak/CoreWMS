import { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip,
    IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Typography
} from '@mui/material';
import { RefreshCw, Code } from 'lucide-react';
import { getFilaImpressao, getDebugZpl } from '../../../../services/printHubService';

const FilaTab = () => {
    const [fila, setFila] = useState([]);
    const [debugZpl, setDebugZpl] = useState(null);

    const load = async () => {
        try {
            const data = await getFilaImpressao();
            // Suporte se o back retornar Page ou List direto
            setFila(data.content || data || []);
        } catch (e) { console.error(e); }
    };

    useEffect(() => { load(); }, []);

    const handleDebug = async (id) => {
        const zpl = await getDebugZpl(id);
        setDebugZpl(zpl);
    };

    return (
        <Box>
            <Box display="flex" justifyContent="flex-end" mb={2}>
                <Button startIcon={<RefreshCw size={18} />} onClick={load}>Atualizar Fila</Button>
            </Box>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>ID</TableCell>
                            <TableCell>Data</TableCell>
                            <TableCell>Impressora</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Erro</TableCell>
                            <TableCell align="center">ZPL</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {fila.map(f => (
                            <TableRow key={f.id}>
                                <TableCell>#{f.id}</TableCell>
                                <TableCell>{new Date(f.dataCriacao || Date.now()).toLocaleString()}</TableCell>
                                <TableCell>{f.impressoraAlvo?.nome || '?'}</TableCell>
                                <TableCell>
                                    <Chip label={f.status} color={f.status === 'CONCLUIDO' ? 'success' : (f.status === 'ERRO' ? 'error' : 'warning')} size="small" />
                                </TableCell>
                                <TableCell sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {f.mensagemErro}
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton size="small" onClick={() => handleDebug(f.id)}><Code size={16} /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={!!debugZpl} onClose={() => setDebugZpl(null)} maxWidth="md" fullWidth>
                <DialogTitle>Código ZPL Gerado</DialogTitle>
                <DialogContent>
                    <Paper sx={{ p: 2, bgcolor: '#1e1e1e', color: '#00ff00', overflow: 'auto', fontFamily: 'monospace' }}>
                        <pre>{debugZpl}</pre>
                    </Paper>
                </DialogContent>
                <DialogActions><Button onClick={() => setDebugZpl(null)}>Fechar</Button></DialogActions>
            </Dialog>
        </Box>
    );
};
export default FilaTab;