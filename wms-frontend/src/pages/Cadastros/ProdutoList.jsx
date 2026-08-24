import { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tooltip, LinearProgress,
    TextField, InputAdornment, MenuItem, Grid
} from '@mui/material';
import { Plus, Trash2, Edit, Package, Search, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { getProdutos, excluirProduto } from '../../services/produtoService';
import { getParceiros } from '../../services/parceiroService';
import SearchableSelect from '../../components/SearchableSelect';
import ConfirmDialog from '../../components/ConfirmDialog';
import Can from '../../components/Can';

const ProdutoList = () => {
    const navigate = useNavigate();
    const [produtos, setProdutos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [idToDelete, setIdToDelete] = useState(null);

    // Estados de Filtro
    const [busca, setBusca] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('TODOS');

    // CORREÇÃO: Inicializa com 'TODOS' para garantir seleção visual
    const [filtroDepositante, setFiltroDepositante] = useState('TODOS');
    const [listaDepositantes, setListaDepositantes] = useState([]);

    useEffect(() => {
        load();
        loadDepositantes();
    }, []);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getProdutos();
            setProdutos(data?.content || (Array.isArray(data) ? data : []));
        } catch (error) {
            console.error(error);
            toast.error("Erro ao carregar produtos");
        } finally {
            setLoading(false);
        }
    };

    const loadDepositantes = async () => {
        try {
            const parceiros = await getParceiros();
            const options = parceiros.map(p => ({ value: p.id, label: p.nome }));

            // CORREÇÃO: Adiciona opção explícita 'TODOS'
            setListaDepositantes([{ value: 'TODOS', label: 'Todos os Depositantes' }, ...options]);
        } catch (error) {
            console.error("Erro ao carregar depositantes", error);
        }
    };

    const handleDelete = async () => {
        try {
            await excluirProduto(idToDelete);
            toast.success("Produto excluído.");
            load();
        } catch (error) { toast.error("Erro ao excluir."); }
        finally { setConfirmOpen(false); }
    };

    // --- LÓGICA DE FILTRAGEM ---
    const produtosFiltrados = useMemo(() => {
        return produtos.filter(p => {
            // 1. Busca Texto
            const termo = busca.toLowerCase();
            const matchTexto =
                p.nome.toLowerCase().includes(termo) ||
                p.sku.toLowerCase().includes(termo) ||
                (p.ean13 && p.ean13.includes(termo));

            // 2. Filtro Status
            const matchStatus = filtroStatus === 'TODOS'
                ? true
                : (filtroStatus === 'ATIVO' ? p.ativo : !p.ativo);

            // 3. Filtro Depositante
            const idDepProduto = p.depositante?.id || p.depositanteId;

            // CORREÇÃO: Compara com 'TODOS'
            const matchDepositante = filtroDepositante === 'TODOS' || String(idDepProduto) === String(filtroDepositante);

            return matchTexto && matchStatus && matchDepositante;
        });
    }, [produtos, busca, filtroStatus, filtroDepositante]);

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Produtos</Typography>
                    <Typography variant="body2" color="text.secondary">Gerencie o catálogo de itens do estoque.</Typography>
                </Box>
                <Can I="PRODUTO_CRIAR">
                    <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => navigate('/cadastros/produtos/novo')}>
                        Novo Produto
                    </Button>
                </Can>
            </Box>

            {/* BARRA DE FILTROS */}
            <Paper sx={{ width: '100%', mb: 2, p: 2, borderRadius: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    {/* Busca Textual */}
                    <Grid item xs={12} md={5}>
                        <TextField
                            fullWidth
                            placeholder="Buscar por SKU, Nome ou EAN..."
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

                    {/* Filtro de Depositante */}
                    <Grid item xs={12} md={4}>
                        <SearchableSelect
                            label="Filtrar por Depositante"
                            value={filtroDepositante}
                            onChange={(e) => setFiltroDepositante(e.target.value)}
                            options={listaDepositantes}
                        />
                    </Grid>

                    {/* Filtro de Status */}
                    <Grid item xs={12} md={3}>
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

                {!loading && (
                    <Box sx={{ px: 2, py: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #eee' }}>
                        <Typography variant="caption" color="text.secondary">
                            Mostrando {produtosFiltrados.length} de {produtos.length} produtos
                        </Typography>
                    </Box>
                )}

                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: 'background.subtle' }}>
                            <TableRow>
                                <TableCell><b>Item</b></TableCell>
                                <TableCell><b>Depositante</b></TableCell>
                                <TableCell><b>SKU</b></TableCell>
                                <TableCell><b>EAN</b></TableCell>
                                <TableCell><b>Unidade</b></TableCell>
                                <TableCell><b>Status</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {produtosFiltrados.map((p) => (
                                <TableRow key={p.id} hover>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                            <Box p={1} bgcolor="primary.light" borderRadius={1} color="white"><Package size={18} /></Box>
                                            <Typography fontWeight={500} variant="body2">{p.nome}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" color="text.secondary">
                                            {p.depositante?.nome || '---'}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{p.sku}</TableCell>
                                    <TableCell>{p.ean13 || '-'}</TableCell>
                                    <TableCell>{p.unidadeMedida}</TableCell>
                                    <TableCell><Chip label={p.ativo ? "Ativo" : "Inativo"} color={p.ativo ? "success" : "default"} size="small" /></TableCell>
                                    <TableCell align="center">
                                        <Box display="flex" justifyContent="center" gap={1}>
                                            <Can I="PRODUTO_EDITAR">
                                                <Tooltip title="Editar">
                                                    <IconButton size="small" color="primary" onClick={() => navigate(`/cadastros/produtos/${p.id}`)}>
                                                        <Edit size={18} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Can>
                                            <Can I="PRODUTO_EXCLUIR">
                                                <Tooltip title="Excluir">
                                                    <IconButton size="small" color="error" onClick={() => { setIdToDelete(p.id); setConfirmOpen(true); }}>
                                                        <Trash2 size={18} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Can>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && produtosFiltrados.length === 0 && (
                                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nenhum produto encontrado com os filtros atuais.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleDelete}
                title="Excluir Produto"
                message="Deseja realmente excluir este produto?"
            />
        </Box>
    );
};

export default ProdutoList;