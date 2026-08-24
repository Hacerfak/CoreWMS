import { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Dialog, DialogTitle, DialogContent, TextField, DialogActions,
    MenuItem, Tooltip, FormControlLabel, Switch
} from '@mui/material';
import { Plus, Edit, Play } from 'lucide-react';
import { toast } from 'react-toastify';
import { getImpressorasAdmin, salvarImpressora, testarImpressora } from '../../../../services/printHubService';

const ImpressorasTab = () => {
    const [lista, setLista] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ nome: '', tipoConexao: 'REDE', enderecoIp: '', porta: 9100, caminhoCompartilhamento: '', ativo: true });

    useEffect(() => { load(); }, []);
    const load = async () => { setLista(await getImpressorasAdmin()); };

    const handleSave = async () => {
        try {
            await salvarImpressora(form);
            toast.success("Salvo com sucesso!");
            setModalOpen(false);
            load();
        } catch (e) { toast.error("Erro ao salvar."); }
    };

    const handleTest = async (id) => {
        try {
            await testarImpressora(id);
            toast.success("Comando de teste enviado!");
        } catch (e) { toast.error("Erro ao enviar teste."); }
    };

    const handleNew = () => {
        setForm({ nome: '', tipoConexao: 'REDE', enderecoIp: '', porta: 9100, caminhoCompartilhamento: '', ativo: true });
        setModalOpen(true);
    };

    return (
        <Box>
            <Box display="flex" justifyContent="flex-end" mb={2}>
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleNew}>Nova Impressora</Button>
            </Box>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.subtle' }}>
                        <TableRow><TableCell>Nome</TableCell><TableCell>Tipo</TableCell><TableCell>Endereço</TableCell><TableCell>Status</TableCell><TableCell align="center">Ações</TableCell></TableRow>
                    </TableHead>
                    <TableBody>
                        {lista.map(i => (
                            <TableRow key={i.id}>
                                <TableCell><b>{i.nome}</b></TableCell>
                                <TableCell>{i.tipoConexao}</TableCell>
                                <TableCell>{i.tipoConexao === 'REDE' ? `${i.enderecoIp}:${i.porta}` : i.caminhoCompartilhamento}</TableCell>
                                <TableCell>{i.ativo ? 'Ativa' : 'Inativa'}</TableCell>
                                <TableCell align="center">
                                    <Tooltip title="Imprimir Teste">
                                        <IconButton size="small" color="success" onClick={() => handleTest(i.id)}><Play size={16} /></IconButton>
                                    </Tooltip>
                                    <IconButton size="small" onClick={() => { setForm(i); setModalOpen(true); }}><Edit size={16} /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{form.id ? 'Editar' : 'Nova'} Impressora</DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField label="Nome" fullWidth value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />
                        <TextField select label="Tipo" fullWidth value={form.tipoConexao} onChange={e => setForm({ ...form, tipoConexao: e.target.value })}>
                            <MenuItem value="REDE">Rede (IP)</MenuItem>
                            <MenuItem value="COMPARTILHAMENTO">Compartilhamento/USB</MenuItem>
                        </TextField>
                        {form.tipoConexao === 'REDE' ? (
                            <Box display="flex" gap={2}>
                                <TextField label="IP" fullWidth value={form.enderecoIp} onChange={e => setForm({ ...form, enderecoIp: e.target.value })} />
                                <TextField label="Porta" type="number" sx={{ width: 100 }} value={form.porta} onChange={e => setForm({ ...form, porta: e.target.value })} />
                            </Box>
                        ) : (
                            <TextField label="Caminho (\\PC\Zebra ou /dev/usb/lp0)" fullWidth value={form.caminhoCompartilhamento} onChange={e => setForm({ ...form, caminhoCompartilhamento: e.target.value })} />
                        )}
                        <FormControlLabel control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />} label="Ativa" />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSave}>Salvar</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
export default ImpressorasTab;