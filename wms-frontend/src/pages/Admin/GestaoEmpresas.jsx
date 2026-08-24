import { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, LinearProgress,
    TextField, InputAdornment, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, Grid
} from '@mui/material';
import { Plus, Edit, Trash2, Search, Building2, Save, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom'; // <--- Importante
import { getTodasEmpresas, salvarEmpresa, excluirEmpresa } from '../../services/empresaService';
import ConfirmDialog from '../../components/ConfirmDialog';

const GestaoEmpresas = () => {
    const navigate = useNavigate(); // <--- Hook de navegação
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');

    // Dialog apenas para EDIÇÃO (Não criação)
    const [openDialog, setOpenDialog] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({ id: '', razaoSocial: '', cnpj: '', tenantId: '', ativo: true });

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [idToDelete, setIdToDelete] = useState(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getTodasEmpresas();
            setEmpresas(data);
        } catch (error) { toast.error("Erro ao carregar empresas."); }
        finally { setLoading(false); }
    };

    const filteredEmpresas = useMemo(() => {
        const term = busca.toLowerCase();
        return empresas.filter(e =>
            e.razaoSocial.toLowerCase().includes(term) ||
            e.cnpj.includes(term) ||
            e.tenantId?.toLowerCase().includes(term)
        );
    }, [empresas, busca]);

    // --- NOVA LÓGICA: Vai para Onboarding ---
    const handleNewCompany = () => {
        // Redireciona para Onboarding passando a origem
        navigate('/onboarding', { state: { from: '/admin/empresas' } });
    };

    // Edição continua no modal (apenas para correções rápidas)
    const handleOpenEdit = (empresa) => {
        setForm({ ...empresa });
        setOpenDialog(true);
    };

    const handleSaveEdit = async () => {
        if (!form.razaoSocial || !form.cnpj) return toast.warning("Preencha os campos obrigatórios.");
        setSaving(true);
        try {
            await salvarEmpresa(form);
            toast.success("Dados atualizados!");
            setOpenDialog(false);
            load();
        } catch (error) {
            toast.error("Erro ao salvar.");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await excluirEmpresa(idToDelete);
            toast.success("Empresa excluída.");
            load();
        } catch (error) { toast.error("Erro ao excluir."); }
        finally { setConfirmOpen(false); }
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Gestão Global de Empresas</Typography>
                    <Typography variant="body2" color="text.secondary">Administre os Tenants (Ambientes).</Typography>
                </Box>
                {/* Botão leva para Onboarding */}
                <Button variant="contained" startIcon={<Plus size={20} />} onClick={handleNewCompany}>
                    Nova Empresa
                </Button>
            </Box>

            <Paper sx={{ width: '100%', mb: 2, p: 2, borderRadius: 2 }}>
                <TextField
                    fullWidth
                    placeholder="Buscar..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    size="small"
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search size={18} color="#94a3b8" /></InputAdornment> }}
                />
            </Paper>

            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                {loading && <LinearProgress />}
                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: 'background.subtle' }}>
                            <TableRow>
                                <TableCell><b>Empresa</b></TableCell>
                                <TableCell><b>CNPJ</b></TableCell>
                                <TableCell><b>Tenant ID</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredEmpresas.map((emp) => (
                                <TableRow key={emp.id} hover>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                            <Box p={1} bgcolor="primary.light" borderRadius={1} color="white"><Building2 size={18} /></Box>
                                            <Typography fontWeight={500} variant="body2">{emp.razaoSocial}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{emp.cnpj}</TableCell>
                                    <TableCell><Chip label={emp.tenantId} size="small" /></TableCell>
                                    <TableCell align="center">
                                        <Box display="flex" justifyContent="center" gap={1}>
                                            <Tooltip title="Editar">
                                                <IconButton size="small" color="primary" onClick={() => handleOpenEdit(emp)}>
                                                    <Edit size={18} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Excluir">
                                                <IconButton size="small" color="error" onClick={() => { setIdToDelete(emp.id); setConfirmOpen(true); }}>
                                                    <Trash2 size={18} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Modal APENAS de Edição */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Editar Empresa</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={2}>
                        <Grid item xs={12}>
                            <TextField
                                label="Razão Social" fullWidth
                                value={form.razaoSocial} onChange={e => setForm({ ...form, razaoSocial: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField label="CNPJ" fullWidth value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSaveEdit} disabled={saving}>Salvar</Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleDelete} title="Excluir Empresa" message="Tem certeza?" />
        </Box>
    );
};

export default GestaoEmpresas;