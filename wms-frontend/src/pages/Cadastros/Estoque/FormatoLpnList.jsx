import React, { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Grid, Typography, Switch, FormControlLabel, MenuItem, InputAdornment, Chip
} from '@mui/material';
import {
    Plus, Edit, Trash2, Package, Box as BoxIcon,
    Ruler, Weight, Container
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getFormatos, salvarFormato, excluirFormato, alternarStatusFormato } from '../../../services/formatoLpnService';
import ConfirmDialog from '../../../components/ConfirmDialog';

const TIPOS_BASE = [
    { value: 'PALLET', label: 'Pallet', icon: <Container size={16} /> },
    { value: 'CAIXA', label: 'Caixa', icon: <BoxIcon size={16} /> },
    { value: 'GAIOLA', label: 'Gaiola', icon: <Package size={16} /> },
    { value: 'TAMBOR', label: 'Tambor', icon: <Package size={16} /> },
    { value: 'OUTROS', label: 'Outros', icon: <Package size={16} /> }
];

const FormatoLpnList = () => {
    const [lista, setLista] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({});

    const [form, setForm] = useState(initialState());

    function initialState() {
        return {
            id: null, codigo: '', descricao: '', tipoBase: 'PALLET',
            alturaM: '', larguraM: '', profundidadeM: '',
            pesoSuportadoKg: '', taraKg: '', ativo: true
        };
    }

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            const data = await getFormatos();
            setLista(data);
        } catch (error) {
            toast.error("Erro ao carregar formatos.");
        }
    };

    const handleSubmit = async () => {
        try {
            await salvarFormato(form);
            toast.success("Salvo com sucesso!");
            setModalOpen(false);
            loadData();
        } catch (error) {
            toast.error(error.response?.data?.message || "Erro ao salvar.");
        }
    };

    const handleEdit = (item) => {
        setForm(item);
        setModalOpen(true);
    };

    const handleToggleStatus = async (id) => {
        try {
            await alternarStatusFormato(id);
            loadData();
        } catch (e) { toast.error("Erro ao alterar status"); }
    };

    return (
        <Box p={3}>
            <Box display="flex" justifyContent="space-between" mb={3}>
                <Typography variant="h5" fontWeight="bold">Formatos de Armazenamento</Typography>
                <Button variant="contained" startIcon={<Plus />} onClick={() => { setForm(initialState()); setModalOpen(true); }}>
                    Novo Formato
                </Button>
            </Box>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Código</TableCell>
                            <TableCell>Descrição</TableCell>
                            <TableCell>Tipo</TableCell>
                            <TableCell>Dimensões (m)</TableCell>
                            <TableCell>Capacidade</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="center">Ações</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {lista.map((item) => (
                            <TableRow key={item.id}>
                                <TableCell><b>{item.codigo}</b></TableCell>
                                <TableCell>{item.descricao}</TableCell>
                                <TableCell>
                                    <Chip
                                        label={item.tipoBase}
                                        size="small"
                                        color={item.tipoBase === 'PALLET' ? 'primary' : 'default'}
                                        variant="outlined"
                                    />
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={1} fontSize="0.875rem">
                                        <Ruler size={14} color="#666" />
                                        {item.alturaM} x {item.larguraM} x {item.profundidadeM}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" flexDirection="column" fontSize="0.75rem">
                                        <span style={{ color: 'green' }}>Carga: {item.pesoSuportadoKg} kg</span>
                                        <span style={{ color: '#666' }}>Tara: {item.taraKg} kg</span>
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Switch
                                        checked={item.ativo}
                                        onChange={() => handleToggleStatus(item.id)}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <IconButton size="small" onClick={() => handleEdit(item)}><Edit size={18} /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* MODAL DE CADASTRO */}
            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{form.id ? 'Editar' : 'Novo'} Formato</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={4}>
                            <TextField label="Código" fullWidth value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} />
                        </Grid>
                        <Grid item xs={12} sm={8}>
                            <TextField label="Descrição" fullWidth value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField select label="Tipo Base" fullWidth value={form.tipoBase} onChange={e => setForm({ ...form, tipoBase: e.target.value })}>
                                {TIPOS_BASE.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                            </TextField>
                        </Grid>

                        <Grid item xs={12}><Typography variant="subtitle2" color="primary" mt={2}>DIMENSÕES FÍSICAS (Metros)</Typography></Grid>
                        <Grid item xs={4}>
                            <TextField label="Altura" type="number" fullWidth InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} value={form.alturaM} onChange={e => setForm({ ...form, alturaM: e.target.value })} />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField label="Largura" type="number" fullWidth InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} value={form.larguraM} onChange={e => setForm({ ...form, larguraM: e.target.value })} />
                        </Grid>
                        <Grid item xs={4}>
                            <TextField label="Profund." type="number" fullWidth InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} value={form.profundidadeM} onChange={e => setForm({ ...form, profundidadeM: e.target.value })} />
                        </Grid>

                        <Grid item xs={12}><Typography variant="subtitle2" color="primary" mt={2}>PESOS (Kg)</Typography></Grid>
                        <Grid item xs={6}>
                            <TextField label="Peso Suportado (Carga)" type="number" fullWidth InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} value={form.pesoSuportadoKg} onChange={e => setForm({ ...form, pesoSuportadoKg: e.target.value })} />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField label="Tara (Peso da Estrutura)" type="number" fullWidth InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} value={form.taraKg} onChange={e => setForm({ ...form, taraKg: e.target.value })} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSubmit}>Salvar</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default FormatoLpnList;