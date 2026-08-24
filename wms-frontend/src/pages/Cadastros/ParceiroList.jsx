import { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tooltip, LinearProgress,
    TextField, InputAdornment, MenuItem, Grid
} from '@mui/material';
import { Plus, Trash2, Edit, Building2, Search, Filter, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { getParceiros, excluirParceiro } from '../../services/parceiroService';
import ConfirmDialog from '../../components/ConfirmDialog';
import Can from '../../components/Can';

const ParceiroList = () => {
    const navigate = useNavigate();
    const [parceiros, setParceiros] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [idToDelete, setIdToDelete] = useState(null);

    // Estados de Filtro
    const [busca, setBusca] = useState('');
    const [filtroTipo, setFiltroTipo] = useState('TODOS');
    const [filtroStatus, setFiltroStatus] = useState('TODOS');

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const data = await getParceiros();
            setParceiros(data);
        } catch (error) { toast.error("Erro ao carregar parceiros"); }
        finally { setLoading(false); }
    };

    const handleDeleteClick = (id) => {
        setIdToDelete(id);
        setConfirmOpen(true);
    };

    const handleConfirmDelete = async () => {
        try {
            await excluirParceiro(idToDelete);
            toast.success("Parceiro excluído.");
            loadData();
        } catch (error) { toast.error("Erro ao excluir."); }
        finally { setConfirmOpen(false); }
    };

    // --- LÓGICA DE FILTRAGEM ---
    const parceirosFiltrados = useMemo(() => {
        return parceiros.filter(p => {
            // 1. Busca por Texto (Nome, Fantasia, Documento)
            const termo = busca.toLowerCase();
            const matchTexto =
                p.nome.toLowerCase().includes(termo) ||
                (p.nomeFantasia && p.nomeFantasia.toLowerCase().includes(termo)) ||
                p.documento.includes(termo);

            // 2. Filtro de Tipo
            const matchTipo = filtroTipo === 'TODOS' || p.tipo === filtroTipo;

            // 3. Filtro de Status
            const matchStatus = filtroStatus === 'TODOS'
                ? true
                : (filtroStatus === 'ATIVO' ? p.ativo : !p.ativo);

            return matchTexto && matchTipo && matchStatus;
        });
    }, [parceiros, busca, filtroTipo, filtroStatus]);

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Parceiros de Negócio</Typography>
                    <Typography variant="body2" color="text.secondary">Gerencie clientes, fornecedores e transportadoras.</Typography>
                </Box>
                <Can I="PARCEIRO_CRIAR">
                    <Button
                        variant="contained"
                        startIcon={<Plus size={20} />}
                        onClick={() => navigate('/cadastros/parceiros/novo')}
                    >
                        Novo Parceiro
                    </Button>
                </Can>
            </Box>

            <Paper sx={{ width: '100%', mb: 2, p: 2, borderRadius: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            placeholder="Buscar por Nome, Fantasia ou CPF/CNPJ..."
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                            size="small"
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><Search size={18} color="#94a3b8" /></InputAdornment>,
                                endAdornment: busca && (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setBusca('')}><X size={16} /></IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <TextField
                            select
                            fullWidth
                            label="Tipo"
                            size="small"
                            value={filtroTipo}
                            onChange={(e) => setFiltroTipo(e.target.value)}
                        >
                            <MenuItem value="TODOS">Todos os Tipos</MenuItem>
                            <MenuItem value="CLIENTE">Cliente</MenuItem>
                            <MenuItem value="FORNECEDOR">Fornecedor</MenuItem>
                            <MenuItem value="TRANSPORTADORA">Transportadora</MenuItem>
                            <MenuItem value="AMBOS">Híbrido</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={6} md={3}>
                        <TextField
                            select
                            fullWidth
                            label="Status"
                            size="small"
                            value={filtroStatus}
                            onChange={(e) => setFiltroStatus(e.target.value)}
                        >
                            <MenuItem value="TODOS">Todos os Status</MenuItem>
                            <MenuItem value="ATIVO">Ativo</MenuItem>
                            <MenuItem value="INATIVO">Inativo</MenuItem>
                        </TextField>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                {loading && <LinearProgress />}

                {/* Contador de Resultados */}
                {!loading && (
                    <Box sx={{ px: 2, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #eee' }}>
                        <Typography variant="caption" color="text.secondary">
                            Mostrando {parceirosFiltrados.length} de {parceiros.length} registros
                        </Typography>
                    </Box>
                )}

                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: 'background.subtle' }}>
                            <TableRow>
                                <TableCell><b>Razão Social</b></TableCell>
                                <TableCell><b>Documento</b></TableCell>
                                <TableCell><b>Tipo</b></TableCell>
                                <TableCell><b>Cidade/UF</b></TableCell>
                                <TableCell><b>Status</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {parceirosFiltrados.map((p) => (
                                <TableRow key={p.id} hover>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                            <Box p={1} bgcolor="primary.light" borderRadius={1} color="white"><Building2 size={18} /></Box>
                                            <Box>
                                                <Typography fontWeight={500} variant="body2">{p.nome}</Typography>
                                                <Typography variant="caption" color="text.secondary">{p.nomeFantasia}</Typography>
                                            </Box>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{p.documento}</TableCell>
                                    <TableCell><Chip label={p.tipo} size="small" variant="outlined" /></TableCell>
                                    <TableCell>{p.cidade}/{p.uf}</TableCell>
                                    <TableCell><Chip label={p.ativo ? "Ativo" : "Inativo"} color={p.ativo ? "success" : "default"} size="small" /></TableCell>
                                    <TableCell align="center">
                                        <Box display="flex" justifyContent="center" gap={1}>
                                            <Can I="PARCEIRO_EDITAR">
                                                <Tooltip title="Editar">
                                                    <IconButton size="small" color="primary" onClick={() => navigate(`/cadastros/parceiros/${p.id}`)}>
                                                        <Edit size={18} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Can>
                                            <Can I="PARCEIRO_EXCLUIR">
                                                <Tooltip title="Excluir">
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteClick(p.id)}>
                                                        <Trash2 size={18} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Can>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && parceirosFiltrados.length === 0 && (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nenhum parceiro encontrado com os filtros atuais.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Excluir Parceiro"
                message="Tem certeza? O histórico será mantido mas o cadastro ficará indisponível."
            />
        </Box>
    );
};

export default ParceiroList;