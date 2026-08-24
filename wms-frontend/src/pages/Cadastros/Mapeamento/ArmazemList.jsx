import { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
    TextField, DialogActions, Switch, FormControlLabel, Chip
} from '@mui/material';
import { Plus, Edit, Trash2, CheckCircle, XCircle, MapPin } from 'lucide-react';
import { toast } from 'react-toastify';
import { getArmazens, salvarArmazem, excluirItem } from '../../../services/mapeamentoService';
import ConfirmDialog from '../../../components/ConfirmDialog';
import Can from '../../../components/Can';

const ArmazemList = () => {
    const [lista, setLista] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);

    // Estados para exclusão
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({ title: '', message: '', action: null });

    const [form, setForm] = useState({
        id: '', codigo: '', nome: '', enderecoCompleto: '', ativo: true
    });

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const data = await getArmazens();
            // Ordenação por Código
            setLista(data.sort((a, b) => a.codigo.localeCompare(b.codigo)));
        } catch (e) { toast.error("Erro ao carregar armazéns"); }
    };

    const handleNew = () => {
        setForm({ id: '', codigo: '', nome: '', enderecoCompleto: '', ativo: true });
        setModalOpen(true);
    };

    const handleEdit = (item) => {
        setForm({ ...item });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!form.codigo || !form.nome) return toast.warning("Preencha Código e Nome.");
        try {
            await salvarArmazem(form);
            toast.success("Armazém salvo!");
            setModalOpen(false);
            loadData();
        } catch (e) {
            toast.error(e.response?.data?.message || "Erro ao salvar.");
        }
    };

    const handleDelete = (id) => {
        setConfirmData({
            title: 'Excluir Armazém',
            message: 'Tem certeza? Isso impedirá o uso de todas as áreas e endereços vinculados.',
            action: async () => {
                try {
                    await excluirItem('armazens', id);
                    toast.success("Armazém excluído!");
                    loadData();
                } catch (error) {
                    toast.error(error.response?.data?.message || "Erro ao excluir. Verifique se há áreas vinculadas.");
                }
            }
        });
        setConfirmOpen(true);
    };

    return (
        <Box>
            {/* BARRA DE AÇÕES */}
            <Box display="flex" justifyContent="flex-end" mb={2}>
                <Can I="LOCALIZACAO_GERENCIAR">
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleNew}>
                        Novo Armazém
                    </Button>
                </Can>
            </Box>

            {/* TABELA */}
            <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.subtle' }}>
                        <TableRow>
                            <TableCell>Código</TableCell>
                            <TableCell>Nome</TableCell>
                            <TableCell>Endereço Físico</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="center">Ações</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {lista.map(item => (
                            <TableRow key={item.id} hover>
                                <TableCell><b>{item.codigo}</b></TableCell>
                                <TableCell>{item.nome}</TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={1} color="text.secondary">
                                        {item.enderecoCompleto && <MapPin size={14} />}
                                        {item.enderecoCompleto || '-'}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    {/* STATUS CHIP (PADRONIZADO) */}
                                    {item.ativo ? (
                                        <Chip
                                            icon={<CheckCircle size={12} />}
                                            label="Ativo"
                                            size="small"
                                            sx={{
                                                fontSize: '0.65rem',
                                                height: 22,
                                                bgcolor: '#dcfce7',
                                                color: '#166534',
                                                fontWeight: '600',
                                                '& .MuiChip-icon': { color: '#16a34a' }
                                            }}
                                        />
                                    ) : (
                                        <Chip
                                            icon={<XCircle size={12} />}
                                            label="Inativo"
                                            size="small"
                                            sx={{
                                                fontSize: '0.65rem',
                                                height: 22,
                                                bgcolor: '#f1f5f9',
                                                color: '#64748b'
                                            }}
                                        />
                                    )}
                                </TableCell>
                                <TableCell align="center">
                                    <Box display="flex" justifyContent="center" gap={1}>
                                        <Can I="LOCALIZACAO_GERENCIAR">
                                            <IconButton size="small" color="primary" onClick={() => handleEdit(item)}>
                                                <Edit size={16} />
                                            </IconButton>
                                        </Can>
                                        <Can I="LOCALIZACAO_EXCLUIR">
                                            <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}>
                                                <Trash2 size={16} />
                                            </IconButton>
                                        </Can>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                        {lista.length === 0 && (
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>Nenhum armazém cadastrado.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* MODAL CADASTRO */}
            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{form.id ? 'Editar' : 'Novo'} Armazém</DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            label="Código"
                            value={form.codigo}
                            onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                            fullWidth required
                            helperText="Ex: CD01, MATRIZ"
                            disabled={!!form.id} // Código imutável na edição
                        />
                        <TextField
                            label="Nome do Armazém"
                            value={form.nome}
                            onChange={e => setForm({ ...form, nome: e.target.value })}
                            fullWidth required
                        />
                        <TextField
                            label="Endereço (Logradouro, Cidade)"
                            value={form.enderecoCompleto}
                            onChange={e => setForm({ ...form, enderecoCompleto: e.target.value })}
                            fullWidth
                        />
                        <FormControlLabel
                            control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} color="success" />}
                            label="Ativo"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSubmit}>Salvar</Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={confirmData.action}
                title={confirmData.title}
                message={confirmData.message}
                severity={confirmData.title.includes('Excluir') ? "error" : "primary"}
            />
        </Box>
    );
};

export default ArmazemList;