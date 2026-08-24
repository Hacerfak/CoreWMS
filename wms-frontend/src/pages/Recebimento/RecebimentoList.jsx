import { useState, useEffect } from 'react';
import {
    Box, Typography, Button, Paper, Chip, IconButton, Tooltip,
    Grid, TextField, LinearProgress, Dialog, DialogTitle,
    DialogContent, DialogActions, MenuItem
} from '@mui/material';
import {
    Plus, Search, PlayCircle, Trash2, FileText,
    CheckCircle2, Clock, Warehouse, LogOut, ArrowLeft,
    Copy, Calendar, Filter, Eye, AlertCircle, XCircle, Truck, User
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';

import api from '../../services/api';
import { getRecebimentos, deleteRecebimento } from '../../services/recebimentoService';
import { getLocalizacoes } from '../../services/localizacaoService';
import SearchableSelect from '../../components/SearchableSelect';
import ConfirmDialog from '../../components/ConfirmDialog';
import Can from '../../components/Can';

// Mapa de Status
const STATUS_MAP = {
    'CRIADA': { label: 'NOVA', color: 'default', icon: <FileText size={16} /> },
    'AGUARDANDO_EXECUCAO': { label: 'AGUARDANDO', color: 'warning', icon: <Clock size={16} /> },
    'EM_PROCESSAMENTO': { label: 'CONFERINDO', color: 'info', icon: <PlayCircle size={16} /> },
    'DIVERGENTE': { label: 'DIVERGENTE', color: 'error', icon: <AlertCircle size={16} /> },
    'CONCLUIDA': { label: 'CONCLUÍDA', color: 'success', icon: <CheckCircle2 size={16} /> },
    'BLOQUEDA': { label: 'BLOQUEADA', color: 'error', icon: <XCircle size={16} /> },
    'CANCELADA': { label: 'CANCELADA', color: 'error', icon: <Trash2 size={16} /> }
};

const RecebimentoList = () => {
    const navigate = useNavigate();

    // Dados
    const [listaCompleta, setListaCompleta] = useState([]);
    const [recebimentosFiltrados, setRecebimentosFiltrados] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filtros
    const [filtros, setFiltros] = useState({
        dataInicio: dayjs().format('YYYY-MM-DD'),
        dataFim: dayjs().format('YYYY-MM-DD'),
        status: 'TODOS',
        busca: ''
    });

    // Modais e Ações
    const [modalEncostar, setModalEncostar] = useState(false);
    const [modalLiberar, setModalLiberar] = useState(false);
    const [docas, setDocas] = useState([]);
    const [selectedDoca, setSelectedDoca] = useState('');
    const [selectedItem, setSelectedItem] = useState(null);
    const [assinaturaFile, setAssinaturaFile] = useState(null);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        aplicarFiltros();
    }, [listaCompleta, filtros]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getRecebimentos();
            const sorted = data.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
            setListaCompleta(sorted);
        } catch (error) { toast.error("Erro ao carregar lista"); }
        finally { setLoading(false); }
    };

    const aplicarFiltros = () => {
        let dados = [...listaCompleta];

        if (filtros.dataInicio && filtros.dataFim) {
            const start = dayjs(filtros.dataInicio).startOf('day');
            const end = dayjs(filtros.dataFim).endOf('day');
            dados = dados.filter(item => {
                const itemDate = dayjs(item.dataCriacao);
                return itemDate.isAfter(start) && itemDate.isBefore(end);
            });
        }

        if (filtros.status !== 'TODOS') {
            dados = dados.filter(item => item.status === filtros.status);
        }

        if (filtros.busca) {
            const termo = filtros.busca.toLowerCase();
            dados = dados.filter(item =>
                (item.notaFiscal && item.notaFiscal.toLowerCase().includes(termo)) ||
                (item.chaveAcesso && item.chaveAcesso.toLowerCase().includes(termo)) ||
                (item.fornecedorNome && item.fornecedorNome.toLowerCase().includes(termo)) ||
                (item.codigoExterno && item.codigoExterno.toLowerCase().includes(termo))
            );
        }

        setRecebimentosFiltrados(dados);
    };

    const getEstadoLogistico = (row) => {
        if (row.agendamentoId) {
            if (row.statusAgendamento === 'NA_DOCA') return 'NA_DOCA';
            if (row.statusAgendamento === 'AGUARDANDO_SAIDA') return 'LIBERADO';
            if (row.statusAgendamento === 'FINALIZADO') return 'SAIU';
            if (row.statusAgendamento === 'NA_PORTARIA' && row.docaNome) return 'DOCA_PLANEJADA';
            return 'NO_PATIO';
        }
        if (row.docaNome && row.status !== 'CANCELADA') return 'NA_DOCA';
        return 'NO_PATIO';
    };

    const handleCopyKey = (key) => {
        if (!key) return;
        navigator.clipboard.writeText(key);
        toast.info("Chave de acesso copiada para a área de transferência!");
    };

    // --- CORREÇÃO: Carregamento de docas com descrição correta ---
    const handleOpenEncostar = async (item) => {
        setSelectedItem(item);
        try {
            const locais = await getLocalizacoes('DOCA');
            // Mapeia usando Descrição se existir, senão Endereço
            setDocas(locais.map(d => ({
                value: d.id,
                label: d.descricao || d.enderecoCompleto
            })));
            setSelectedDoca(item.docaId || '');
            setModalEncostar(true);
        } catch (e) { toast.error("Erro ao carregar docas"); }
    };

    const confirmEncostar = async () => {
        if (!selectedDoca) return toast.warning("Selecione uma doca.");
        try {
            await api.post(`/api/operacao-patio/entrada/${selectedItem.id}/encostar?docaId=${selectedDoca}`);
            toast.success("Doca atribuída!");
            setModalEncostar(false);
            loadData();
        } catch (e) { toast.error(e.response?.data?.message || "Erro ao atribuir."); }
    };

    const handleOpenLiberar = (item) => {
        setSelectedItem(item);
        setAssinaturaFile(null);
        setModalLiberar(true);
    };

    const confirmLiberar = async () => {
        if (!assinaturaFile) return toast.warning("Assinatura obrigatória.");
        const formData = new FormData();
        formData.append('assinatura', assinaturaFile);
        try {
            await api.post(`/api/operacao-patio/entrada/${selectedItem.id}/liberar`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            toast.success("Doca liberada!");
            setModalLiberar(false);
            loadData();
        } catch (e) { toast.error(e.response?.data?.message || "Erro ao liberar."); }
    };

    const handleDetalhes = (id) => navigate(`/recebimento/${id}/detalhes`);

    const handleDeleteClick = (id, status) => {
        if (status !== 'CRIADA' && status !== 'AGUARDANDO_EXECUCAO') return toast.warning("Em andamento.");
        setConfirmAction(() => async () => {
            try { await deleteRecebimento(id); toast.success("Excluído"); loadData(); }
            catch (e) { toast.error("Erro ao excluir"); }
        });
        setConfirmOpen(true);
    };

    return (
        <Box>
            {/* HEADER */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/recebimento')} color="inherit">Voltar</Button>
                    <Typography variant="h5" fontWeight="bold">Solicitações de Entrada</Typography>
                </Box>
                <Can I="RECEBIMENTO_IMPORTAR_XML">
                    <Button variant="contained" startIcon={<Plus />} onClick={() => navigate('/recebimento/importar')}>
                        Nova Entrada
                    </Button>
                </Can>
            </Box>

            {/* FILTROS */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={2}>
                        <TextField
                            label="Data Início" type="date" fullWidth size="small"
                            InputLabelProps={{ shrink: true }}
                            value={filtros.dataInicio}
                            onChange={e => setFiltros({ ...filtros, dataInicio: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <TextField
                            label="Data Fim" type="date" fullWidth size="small"
                            InputLabelProps={{ shrink: true }}
                            value={filtros.dataFim}
                            onChange={e => setFiltros({ ...filtros, dataFim: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            label="Buscar (NF, Chave, Fornecedor)" fullWidth size="small"
                            value={filtros.busca}
                            onChange={e => setFiltros({ ...filtros, busca: e.target.value })}
                            placeholder="Digite para filtrar..."
                        />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            select label="Status" fullWidth size="small"
                            value={filtros.status}
                            onChange={e => setFiltros({ ...filtros, status: e.target.value })}
                        >
                            <MenuItem value="TODOS">Todos</MenuItem>
                            {Object.keys(STATUS_MAP).map(key => (
                                <MenuItem key={key} value={key}>{STATUS_MAP[key].label}</MenuItem>
                            ))}
                        </TextField>
                    </Grid>
                </Grid>
            </Paper>

            {/* LISTA DE CARDS */}
            <Grid container spacing={2}>
                {loading && <Grid item xs={12}><LinearProgress /></Grid>}

                {!loading && recebimentosFiltrados.length === 0 && (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: '#f8fafc', border: '1px dashed #e2e8f0' }}>
                            <FileText size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
                            <Typography color="text.secondary">Nenhuma solicitação encontrada.</Typography>
                        </Paper>
                    </Grid>
                )}

                {recebimentosFiltrados.map((item) => {
                    const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.CRIADA;
                    const estadoLogistico = getEstadoLogistico(item);
                    const dataFormatada = dayjs(item.dataCriacao).format('DD/MM/YYYY HH:mm');

                    return (
                        <Grid item xs={12} key={item.id}>
                            <Paper
                                elevation={0}
                                sx={{
                                    p: 2,
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 3,
                                    borderLeft: `6px solid`,
                                    borderLeftColor: `${statusInfo.color}.main`,
                                    transition: '0.2s',
                                    '&:hover': { boxShadow: '0 8px 16px rgba(0,0,0,0.05)', transform: 'translateY(-2px)' }
                                }}
                            >
                                <Grid container alignItems="center" spacing={2}>

                                    {/* 1. DOCUMENTO FISCAL (NF + CHAVE) - CENTRALIZADO */}
                                    <Grid item xs={12} sm={4} md={3}
                                        sx={{
                                            borderRight: { sm: '1px solid #f1f5f9' },
                                            pr: { sm: 2 },
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                            <FileText size={16} color="#94a3b8" />
                                            <Typography variant="caption" color="text.secondary" fontWeight="600">
                                                NOTA FISCAL
                                            </Typography>
                                        </Box>

                                        <Typography variant="h5" fontWeight="800" color="text.primary">
                                            {item.notaFiscal || 'N/A'}
                                        </Typography>

                                        {item.chaveAcesso && (
                                            <Chip
                                                icon={<Copy size={14} />}
                                                label="Chave de Acesso"
                                                size="small"
                                                variant="outlined"
                                                onClick={() => handleCopyKey(item.chaveAcesso)}
                                                sx={{
                                                    mt: 1,
                                                    cursor: 'pointer',
                                                    bgcolor: '#f8fafc',
                                                    fontWeight: '600',
                                                    fontSize: '0.75rem',
                                                    '&:hover': { bgcolor: '#f1f5f9' }
                                                }}
                                            />
                                        )}
                                    </Grid>

                                    {/* 2. DADOS PRINCIPAIS (DEPOSITANTE, DATA, DOCA) - CENTRALIZADO COM BARRA NA DIREITA */}
                                    <Grid item xs={12} sm={5} md={6}
                                        sx={{
                                            borderRight: { sm: '1px solid #f1f5f9' }, // BARRA VERTICAL ADICIONADA
                                            px: { sm: 2 }, // Padding horizontal para afastar das barras
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center',
                                            textAlign: 'center'
                                        }}
                                    >
                                        <Box mb={1} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                                                <User size={16} color="#94a3b8" />
                                                <Typography variant="caption" color="text.secondary" fontWeight="600">
                                                    FORNECEDOR / DEPOSITANTE
                                                </Typography>
                                            </Box>
                                            <Typography variant="subtitle1" fontWeight="bold" noWrap title={item.fornecedorNome} sx={{ maxWidth: '100%' }}>
                                                {item.fornecedorNome || "Fornecedor Desconhecido"}
                                            </Typography>
                                        </Box>

                                        <Box display="flex" gap={3} color="text.secondary" flexWrap="wrap" justifyContent="center">
                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Calendar size={16} />
                                                <Typography variant="body2" fontWeight="500">
                                                    {dataFormatada}
                                                </Typography>
                                            </Box>

                                            <Box display="flex" alignItems="center" gap={1}>
                                                <Warehouse size={16} color={item.docaNome ? "#2563eb" : "#94a3b8"} />
                                                {item.docaNome ? (
                                                    <Typography variant="body2" fontWeight="bold" color="primary">
                                                        {item.docaNome}
                                                    </Typography>
                                                ) : (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Doca não atribuída
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    </Grid>

                                    {/* 3. STATUS E AÇÕES - CENTRALIZADO */}
                                    <Grid item xs={12} sm={3} md={3}
                                        sx={{
                                            pl: { sm: 2 },
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <Chip
                                            icon={statusInfo.icon}
                                            label={statusInfo.label}
                                            color={statusInfo.color}
                                            size="small"
                                            sx={{ fontWeight: 'bold', mb: 1 }}
                                        />

                                        <Box display="flex" gap={1} flexWrap="wrap" justifyContent="center">
                                            {/* ENCOSTAR (Atribuir Doca) */}
                                            {(estadoLogistico === 'NO_PATIO' || (!item.docaId && !item.agendamentoId && estadoLogistico !== 'LIBERADO')) && item.status !== 'CANCELADA' && (
                                                <Tooltip title="Atribuir Doca / Encostar">
                                                    <IconButton size="small" color="primary" sx={{ border: '1px solid #e0f2fe', bgcolor: '#f0f9ff' }} onClick={() => handleOpenEncostar(item)}>
                                                        <Truck size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {/* LIBERAR */}
                                            {estadoLogistico === 'NA_DOCA' && (
                                                <Tooltip title="Liberar Doca">
                                                    <IconButton size="small" color="success" sx={{ border: '1px solid #dcfce7', bgcolor: '#f0fdf4' }} onClick={() => handleOpenLiberar(item)}>
                                                        <LogOut size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {/* DETALHES */}
                                            <Tooltip title="Detalhes da Solicitação">
                                                <IconButton size="small" onClick={() => handleDetalhes(item.id)} sx={{ border: '1px solid #e2e8f0' }}>
                                                    <Eye size={16} />
                                                </IconButton>
                                            </Tooltip>

                                            {/* EXCLUIR */}
                                            {['CRIADA', 'AGUARDANDO_EXECUCAO'].includes(item.status) && (
                                                <Tooltip title="Excluir Solicitação">
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleDeleteClick(item.id, item.status)}
                                                        sx={{ border: '1px solid #fee2e2', bgcolor: '#fef2f2' }}
                                                    >
                                                        <Trash2 size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </Box>
                                    </Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                    );
                })}
            </Grid>

            {/* MODAIS (Mantidos) */}
            <Dialog open={modalEncostar} onClose={() => setModalEncostar(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Atribuir Doca</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" gutterBottom>
                        Selecione a doca para operação da nota <b>{selectedItem?.notaFiscal}</b>.
                    </Typography>
                    <Box mt={2}>
                        <SearchableSelect label="Doca Disponível" options={docas} value={selectedDoca} onChange={e => setSelectedDoca(e.target.value)} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalEncostar(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={confirmEncostar}>Confirmar</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={modalLiberar} onClose={() => setModalLiberar(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Liberar Doca</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" gutterBottom>Anexe o comprovante ou assinatura.</Typography>
                    <Button variant="outlined" component="label" fullWidth sx={{ mt: 2, height: 100, borderStyle: 'dashed' }}>
                        {assinaturaFile ? assinaturaFile.name : "Clique para anexar"}
                        <input type="file" hidden accept="image/*" onChange={e => setAssinaturaFile(e.target.files[0])} />
                    </Button>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalLiberar(false)}>Cancelar</Button>
                    <Button variant="contained" color="success" onClick={confirmLiberar} disabled={!assinaturaFile}>Liberar</Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={confirmAction} title="Excluir" message="Tem certeza? Isso removerá a nota e itens." />
        </Box>
    );
};

export default RecebimentoList;