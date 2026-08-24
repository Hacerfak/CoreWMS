import { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent,
    TextField, DialogActions, MenuItem, Switch, FormControlLabel, Chip
} from '@mui/material';
import { Plus, Edit, Trash2, Filter, CheckCircle, XCircle } from 'lucide-react'; // Adicionado Filter
import { toast } from 'react-toastify';
import { getArmazens, getAreas, salvarArea, excluirItem } from '../../../services/mapeamentoService';
import ConfirmDialog from '../../../components/ConfirmDialog';
import Can from '../../../components/Can';

const AreaList = () => {
    const [armazens, setArmazens] = useState([]);
    const [armazemSelecionado, setArmazemSelecionado] = useState('');
    const [busca, setBusca] = useState(''); // Novo estado para busca textual
    const [lista, setLista] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);

    // Estados para exclusão
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({ title: '', message: '', action: null });

    const [form, setForm] = useState({
        id: '', armazemId: '', codigo: '', nome: '', ativo: true
    });

    useEffect(() => { loadArmazens(); }, []);

    const loadArmazens = async () => {
        try {
            const data = await getArmazens();
            setArmazens(data);
            if (data.length > 0) setArmazemSelecionado(data[0].id);
        } catch (e) { toast.error("Erro ao carregar armazéns"); }
    };

    useEffect(() => { if (armazemSelecionado) loadAreas(); }, [armazemSelecionado]);

    const loadAreas = async () => {
        try {
            const data = await getAreas(armazemSelecionado);
            setLista(data || []);
        } catch (e) { toast.error("Erro ao carregar áreas"); }
    };

    // --- FILTRAGEM LOCAL ---
    const listaFiltrada = useMemo(() => {
        if (!busca) return lista;
        const termo = busca.toUpperCase();
        return lista.filter(item =>
            item.codigo.toUpperCase().includes(termo) ||
            item.nome.toUpperCase().includes(termo)
        );
    }, [lista, busca]);

    // --- AÇÕES ---
    const handleNew = () => {
        setForm({
            id: '', armazemId: armazemSelecionado, codigo: '', nome: '', ativo: true
        });
        setModalOpen(true);
    };

    const handleEdit = (item) => {
        setForm({
            id: item.id,
            armazemId: item.armazem.id,
            codigo: item.codigo,
            nome: item.nome,
            ativo: item.ativo
        });
        setModalOpen(true);
    };

    const handleSubmit = async () => {
        if (!form.codigo || !form.nome) return toast.warning("Preencha Código e Nome.");
        try {
            await salvarArea(form);
            toast.success("Área salva!");
            setModalOpen(false);
            loadAreas();
        } catch (e) {
            toast.error(e.response?.data?.message || "Erro ao salvar.");
        }
    };

    const handleDelete = (id) => {
        setConfirmData({
            title: 'Excluir Área',
            message: 'Tem certeza? A exclusão só é permitida se não houver endereços vinculados.',
            action: async () => {
                try {
                    await excluirItem('areas', id);
                    toast.success("Área excluída!");
                    loadAreas();
                } catch (error) {
                    toast.error(error.response?.data?.message || "Erro ao excluir.");
                }
            }
        });
        setConfirmOpen(true);
    };

    return (
        <Box>
            {/* 1. BARRA DE FILTROS E AÇÕES (PADRONIZADA) */}
            <Paper sx={{ p: 2, mb: 2, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>

                {/* Lado Esquerdo: Filtros */}
                <Box display="flex" gap={2} alignItems="center" flex={1}>
                    <Filter size={20} color="#64748b" />

                    <TextField
                        select
                        label="Filtrar por Armazém"
                        size="small"
                        value={armazemSelecionado}
                        onChange={e => setArmazemSelecionado(e.target.value)}
                        sx={{ minWidth: 250 }}
                    >
                        {armazens.map(a => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                    </TextField>

                    <TextField
                        placeholder="Buscar por nome ou código..."
                        size="small"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        sx={{ flex: 1, maxWidth: 400 }}
                    />
                </Box>

                {/* Lado Direito: Botões */}
                <Box display="flex" gap={1}>
                    <Can I="LOCALIZACAO_GERENCIAR">
                        <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleNew} disabled={!armazemSelecionado}>
                            Nova Área
                        </Button>
                    </Can>
                </Box>
            </Paper>

            {/* 2. TABELA */}
            <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
                <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.subtle' }}>
                        <TableRow>
                            <TableCell>Código</TableCell>
                            <TableCell>Nome</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="center">Ações</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {listaFiltrada.map(item => (
                            <TableRow key={item.id} hover>
                                <TableCell><b>{item.codigo}</b></TableCell>
                                <TableCell>{item.nome}</TableCell>
                                <TableCell>
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
                        {listaFiltrada.length === 0 && (
                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>Nenhuma área encontrada.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* MODAL CADASTRO */}
            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{form.id ? 'Editar' : 'Nova'} Área</DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField
                            label="Código"
                            value={form.codigo}
                            onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                            fullWidth required
                            helperText="Ex: RUA-A, MEZANINO"
                            disabled={!!form.id}
                        />
                        <TextField
                            label="Nome da Área"
                            value={form.nome}
                            onChange={e => setForm({ ...form, nome: e.target.value })}
                            fullWidth required
                        />
                        <FormControlLabel
                            control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />}
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
                title={confirmData.title || ''}
                message={confirmData.message || ''}
                severity={confirmData.title && confirmData.title.includes('Excluir') ? "error" : "primary"}
            />
        </Box>
    );
};
export default AreaList;