import { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Dialog, DialogTitle, DialogContent, TextField, DialogActions,
    Switch, FormControlLabel, MenuItem, Grid, Typography, Checkbox,
    Fade, Alert, Chip, LinearProgress, Menu, Divider
} from '@mui/material';
import {
    Plus, Edit, Trash2, Upload, Download,
    CheckSquare, XSquare, Filter, FileSpreadsheet, MoreHorizontal,
    Layers, Shield, Truck, Package, MousePointerClick, Archive,
    Grid as GridIcon, BoxSelect, Container, Edit3, Copy, CheckCircle, XCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getArmazens, getAreas, getLocais, salvarLocal, excluirItem } from '../../../services/mapeamentoService';
import api from '../../../services/api';
import ConfirmDialog from '../../../components/ConfirmDialog';
import Can from '../../../components/Can';

const TIPOS_LOCAL = ['ARMAZENAGEM', 'PICKING', 'PULMAO', 'DOCA', 'STAGE', 'AVARIA', 'QUARENTENA', 'PERDA'];
const TIPOS_ESTRUTURA = ['PORTA_PALLET', 'BLOCADO', 'DRIVE_IN', 'PUSH_BACK'];

const LocalizacaoList = () => {
    // --- ESTADOS ---
    // Filtros e Dados
    const [armazens, setArmazens] = useState([]);
    const [areas, setAreas] = useState([]);
    const [filtros, setFiltros] = useState({ armazemId: '', areaId: '', busca: '' });
    const [lista, setLista] = useState([]);
    const [loading, setLoading] = useState(false);

    // Seleção e Menus
    const [selectedIds, setSelectedIds] = useState([]);
    const [anchorEl, setAnchorEl] = useState(null);
    const openMenu = Boolean(anchorEl);

    // Modais
    const [modalOpen, setModalOpen] = useState(false); // Cadastro Individual
    const [bulkModalOpen, setBulkModalOpen] = useState(false); // Edição em Massa
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({ title: '', message: '', action: null });

    // Forms
    const [form, setForm] = useState(initialFormState());

    // Form de Edição em Massa (Strings vazias indicam "Não Alterar")
    const [bulkForm, setBulkForm] = useState({
        tipo: '', estrutura: '',
        capacidadeLpn: '', capacidadePeso: '', capacidadeMaxima: '',
        ativo: '', bloqueado: '', virtualLocation: '', permiteMultiLpn: ''
    });

    const [file, setFile] = useState(null);

    function initialFormState() {
        return {
            areaId: filtros.areaId || '',
            codigo: '', descricao: '',
            tipo: 'PULMAO', tipoEstrutura: 'PORTA_PALLET',
            virtual: false, permiteMultiLpn: true,
            capacidadeLpn: 1, capacidadePesoKg: 1200,
            capacidadeMaxima: 1,
            bloqueado: false, ativo: true
        };
    }

    // --- CARGAS INICIAIS ---
    useEffect(() => { loadArmazens(); }, []);
    useEffect(() => { if (filtros.armazemId) loadAreas(filtros.armazemId); else setAreas([]); }, [filtros.armazemId]);
    useEffect(() => { if (filtros.areaId) loadLocais(); }, [filtros.areaId]);

    const loadArmazens = async () => {
        try {
            const data = await getArmazens();
            setArmazens(data);
            if (data.length > 0) setFiltros(prev => ({ ...prev, armazemId: data[0].id }));
        } catch (e) { toast.error("Erro ao carregar armazéns"); }
    };

    const loadAreas = async (id) => {
        try {
            const data = await getAreas(id);
            setAreas(data);
            if (data.length > 0) setFiltros(prev => ({ ...prev, areaId: data[0].id }));
            else { setFiltros(prev => ({ ...prev, areaId: '' })); setLista([]); }
        } catch (e) { toast.error("Erro ao carregar áreas"); }
    };

    const loadLocais = async () => {
        setLoading(true);
        try {
            const data = await getLocais(filtros.areaId);
            // Ordenação local garantida
            const sorted = data ? data.sort((a, b) => a.codigo.localeCompare(b.codigo)) : [];
            setLista(sorted);
            setSelectedIds([]);
        } catch (e) { toast.error("Erro ao carregar locais"); }
        finally { setLoading(false); }
    };

    // --- SELEÇÃO ---
    const handleSelectAll = (e) => {
        if (e.target.checked) setSelectedIds(lista.map(i => i.id));
        else setSelectedIds([]);
    };

    const handleSelectOne = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    // --- MÉTODOS DE AÇÃO ---

    // Abre Modal de Edição em Massa
    const handleOpenBulkEdit = () => {
        setAnchorEl(null);
        if (selectedIds.length === 0) return;
        // Reset do form de massa
        setBulkForm({
            tipo: '', estrutura: '',
            capacidadeLpn: '', capacidadePeso: '', capacidadeMaxima: '',
            ativo: '', bloqueado: '', virtualLocation: '', permiteMultiLpn: ''
        });
        setBulkModalOpen(true);
    };

    // Envia Edição em Massa
    const handleBulkSubmit = async () => {
        const payload = { ids: selectedIds };

        // Apenas adiciona ao payload se tiver valor preenchido
        if (bulkForm.tipo) payload.tipo = bulkForm.tipo;
        if (bulkForm.estrutura) payload.estrutura = bulkForm.estrutura;
        if (bulkForm.capacidadeLpn) payload.capacidadeLpn = parseInt(bulkForm.capacidadeLpn);
        if (bulkForm.capacidadePeso) payload.capacidadePeso = parseFloat(bulkForm.capacidadePeso);
        if (bulkForm.capacidadeMaxima) payload.capacidadeMaxima = parseInt(bulkForm.capacidadeMaxima);

        // Booleanos (Select 'true'/'false' -> Boolean)
        if (bulkForm.ativo !== '') payload.ativo = bulkForm.ativo === 'true';
        if (bulkForm.bloqueado !== '') payload.bloqueado = bulkForm.bloqueado === 'true';
        if (bulkForm.virtualLocation !== '') payload.virtualLocation = bulkForm.virtualLocation === 'true';
        if (bulkForm.permiteMultiLpn !== '') payload.permiteMultiLpn = bulkForm.permiteMultiLpn === 'true';

        if (Object.keys(payload).length === 1) return toast.info("Nenhuma alteração selecionada.");

        try {
            await api.post('/api/mapeamento/locais/bulk-update', payload);
            toast.success(`${selectedIds.length} itens atualizados com sucesso!`);
            setBulkModalOpen(false);
            loadLocais();
        } catch (e) {
            toast.error("Erro na atualização em massa.");
        }
    };

    // Ações Rápidas da Barra (Ativar/Excluir)
    const handleQuickAction = (type, value) => {
        setConfirmData({
            title: type === 'DELETE' ? 'Exclusão em Massa' : 'Atualização Rápida',
            message: `Deseja aplicar esta ação em ${selectedIds.length} itens selecionados?`,
            action: async () => {
                try {
                    const payload = { ids: selectedIds };
                    if (type === 'ATIVO') payload.ativo = value;

                    if (type === 'DELETE') {
                        // Loop de exclusão (ou endpoint específico se houver)
                        for (const id of selectedIds) await excluirItem('locais', id);
                    } else {
                        await api.post('/api/mapeamento/locais/bulk-update', payload);
                    }
                    toast.success("Operação concluída!");
                    loadLocais();
                } catch (e) { toast.error("Erro na operação."); }
            }
        });
        setConfirmOpen(true);
    };

    // --- CRUD INDIVIDUAL ---
    const handleSave = async () => {
        try {
            await salvarLocal(form);
            toast.success("Salvo com sucesso!");
            setModalOpen(false);
            loadLocais();
        } catch (e) { toast.error("Erro ao salvar."); }
    };

    const handleDelete = (id) => {
        setConfirmData({
            title: 'Excluir Endereço',
            message: 'Tem certeza? Isso é irreversível.',
            action: async () => {
                try { await excluirItem('locais', id); toast.success("Excluído!"); loadLocais(); }
                catch (e) { toast.error("Erro ao excluir."); }
            }
        });
        setConfirmOpen(true);
    };

    // --- IMPORTAÇÃO ---
    const handleImport = async () => {
        if (!file) return toast.warning("Selecione um arquivo.");
        const formData = new FormData();
        formData.append('file', file);

        try {
            setLoading(true);
            await api.post('/api/mapeamento/locais/importar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success("Importação concluída! Atualizando o sistema, aguarde...");
            setImportModalOpen(false);
            setFile(null);

            // Aguarda 1.5s para o usuário ler o aviso e recarrega a página
            // Isso garante que novos Armazéns/Áreas apareçam e volta para a aba inicial
            setTimeout(() => {
                window.location.reload();
            }, 1500);

        } catch (e) {
            console.error(e);
            toast.error(e.response?.data?.message || "Erro na importação.");
        } finally {
            setLoading(false);
        }
    };

    const handleDownloadModel = () => {
        const header = "ARMAZEM;AREA;CODIGO;DESCRICAO;TIPO;ESTRUTURA;CAP_LPN;CAP_KG;CAP_EMPILHAMENTO;ATIVO;BLOQUEADO;VIRTUAL;MULTI_LPN";
        const row1 = "MATRIZ;RUA-A;01-01-01;Rua A Nivel 1 Pos 1;ARMAZENAGEM;PORTA_PALLET;1;1200;1;SIM;NAO;NAO;SIM";
        const row2 = "MATRIZ;BLOCO-B;B-01;Blocado B01;ARMAZENAGEM;BLOCADO;1;5000;4;SIM;NAO;NAO;SIM";
        const csvContent = "\uFEFF" + [header, row1, row2].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "modelo_locais.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // --- CONFIGURAÇÃO VISUAL DAS PÍLULAS ---
    const getTipoConfig = (tipo) => {
        switch (tipo) {
            case 'DOCA': return { color: 'info', icon: <Truck size={14} />, label: 'Doca' };
            case 'PICKING': return { color: 'warning', icon: <MousePointerClick size={14} />, label: 'Picking' };
            case 'ARMAZENAGEM': return { color: 'default', icon: <Package size={14} />, label: 'Armaz.' };
            case 'PULMAO': return { color: 'secondary', icon: <Archive size={14} />, label: 'Pulmão' };
            case 'STAGE': return { color: 'success', icon: <BoxSelect size={14} />, label: 'Stage' };
            default: return { color: 'default', icon: <Container size={14} />, label: tipo };
        }
    };

    const getEstConfig = (est) => {
        switch (est) {
            case 'PORTA_PALLET': return { color: 'primary', icon: <GridIcon size={14} />, label: 'P. Pallet' };
            case 'BLOCADO': return { color: 'secondary', icon: <Layers size={14} />, label: 'Blocado' };
            default: return { color: 'default', icon: <GridIcon size={14} />, label: est };
        }
    };

    // --- RENDERIZAÇÃO ---
    const listaFiltrada = useMemo(() => {
        if (!filtros.busca) return lista;
        const termo = filtros.busca.toUpperCase();
        return lista.filter(i =>
            (i.enderecoCompleto && i.enderecoCompleto.includes(termo)) ||
            (i.descricao && i.descricao.toUpperCase().includes(termo))
        );
    }, [lista, filtros.busca]);

    const showEmpilhamento = ['BLOCADO', 'DRIVE_IN', 'PUSH_BACK'].includes(form.tipoEstrutura);

    return (
        <Box>
            {/* 1. BARRA DE FILTROS */}
            <Paper sx={{ p: 2, mb: 2, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>

                {/* LADO ESQUERDO: FILTROS */}
                <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
                    <Filter size={20} color="#64748b" />
                    <TextField select label="Armazém" size="small" value={filtros.armazemId} onChange={e => setFiltros({ ...filtros, armazemId: e.target.value })} sx={{ minWidth: 200 }}>
                        {armazens.map(a => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                    </TextField>
                    <TextField select label="Área / Zona" size="small" value={filtros.areaId} onChange={e => setFiltros({ ...filtros, areaId: e.target.value })} sx={{ minWidth: 200 }} disabled={!filtros.armazemId}>
                        {areas.map(a => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                    </TextField>
                    <TextField placeholder="Buscar endereço..." size="small" value={filtros.busca} onChange={e => setFiltros({ ...filtros, busca: e.target.value })} sx={{ minWidth: 250 }} />
                </Box>

                {/* LADO DIREITO: BOTÕES */}
                <Box display="flex" gap={1}>
                    <Can I="LOCALIZACAO_GERENCIAR">
                        <Button variant="outlined" startIcon={<Upload size={18} />} onClick={() => setImportModalOpen(true)}>Importar</Button>
                        <Button variant="contained" startIcon={<Plus size={18} />} onClick={() => { setForm(initialFormState()); setModalOpen(true); }} disabled={!filtros.areaId}>Novo Endereço</Button>
                    </Can>
                </Box>
            </Paper>

            {/* 2. BARRA DE AÇÕES EM MASSA */}
            <Fade in={selectedIds.length > 0}>
                <Paper sx={{ p: 1, mb: 2, bgcolor: '#f0f9ff', border: '1px solid #bae6fd', display: selectedIds.length > 0 ? 'flex' : 'none', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ ml: 2, fontWeight: 'bold', color: '#0369a1' }}>
                        {selectedIds.length} itens selecionados
                    </Typography>
                    <Box display="flex" gap={1}>
                        <Button size="small" startIcon={<CheckSquare size={16} />} onClick={() => handleQuickAction('ATIVO', true)}>Ativar</Button>
                        <Button size="small" startIcon={<XSquare size={16} />} onClick={() => handleQuickAction('ATIVO', false)}>Inativar</Button>
                        <Button size="small" color="error" startIcon={<Trash2 size={16} />} onClick={() => handleQuickAction('DELETE', true)}>Excluir</Button>

                        <Button size="small" variant="outlined" onClick={(e) => setAnchorEl(e.currentTarget)} startIcon={<MoreHorizontal size={16} />}>Mais Ações</Button>
                        <Menu anchorEl={anchorEl} open={openMenu} onClose={() => setAnchorEl(null)}>
                            <MenuItem onClick={handleOpenBulkEdit}>
                                <Edit3 size={16} style={{ marginRight: 8 }} /> Editar Selecionados
                            </MenuItem>
                        </Menu>
                    </Box>
                </Paper>
            </Fade>

            {/* 3. TABELA */}
            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                {loading && <LinearProgress />}
                <TableContainer sx={{ maxHeight: '60vh' }}>
                    <Table size="small" stickyHeader>
                        <TableHead sx={{ bgcolor: 'background.subtle' }}>
                            <TableRow>
                                <TableCell padding="checkbox"><Checkbox checked={listaFiltrada.length > 0 && selectedIds.length === listaFiltrada.length} indeterminate={selectedIds.length > 0 && selectedIds.length < listaFiltrada.length} onChange={handleSelectAll} /></TableCell>
                                <TableCell><b>Endereço</b></TableCell>
                                <TableCell><b>Tipo / Estrutura</b></TableCell>
                                <TableCell><b>Capacidade</b></TableCell>
                                <TableCell><b>Regras</b></TableCell>
                                <TableCell><b>Status</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {listaFiltrada.map(item => {
                                const tipoInfo = getTipoConfig(item.tipo);
                                const estInfo = getEstConfig(item.tipoEstrutura);
                                return (
                                    <TableRow key={item.id} hover selected={selectedIds.includes(item.id)}>
                                        <TableCell padding="checkbox"><Checkbox checked={selectedIds.includes(item.id)} onChange={() => handleSelectOne(item.id)} /></TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="bold">{item.enderecoCompleto}</Typography>
                                            <Typography variant="caption" color="text.secondary">{item.descricao || '-'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box display="flex" flexDirection="column" gap={0.5} alignItems="flex-start">
                                                <Chip icon={tipoInfo.icon} label={tipoInfo.label} color={tipoInfo.color} size="small" variant="filled" sx={{ fontSize: '0.65rem', height: 22, fontWeight: 600 }} />
                                                <Chip icon={estInfo.icon} label={estInfo.label} variant="outlined" color="primary" size="small" sx={{ fontSize: '0.65rem', height: 22 }} />
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" display="block"><b>{item.capacidadeLpn}</b> Pallets</Typography>
                                            {['BLOCADO', 'DRIVE_IN', 'PUSH_BACK'].includes(item.tipoEstrutura) && (
                                                <Typography variant="caption" display="block" color="info.main">Empilha: {item.capacidadeMaxima}x</Typography>
                                            )}
                                            <Typography variant="caption" display="block" color="text.secondary">{item.capacidadePesoKg} kg</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Box display="flex" gap={0.5} flexWrap="wrap">
                                                {item.virtual && (
                                                    <Chip
                                                        icon={<Layers size={12} />}
                                                        label="Virtual"
                                                        size="small"
                                                        variant="outlined"
                                                        sx={{
                                                            fontSize: '0.65rem',
                                                            height: 22,
                                                            borderColor: '#cbd5e1',
                                                            color: '#64748b'
                                                        }}
                                                    />
                                                )}
                                                {item.permiteMultiLpn && (
                                                    <Chip
                                                        icon={<Copy size={12} />}
                                                        label="Multi-LPN"
                                                        size="small"
                                                        sx={{
                                                            fontSize: '0.65rem',
                                                            height: 22,
                                                            bgcolor: '#eff6ff',
                                                            color: '#1e40af',
                                                            '& .MuiChip-icon': { color: '#3b82f6' }
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Box display="flex" gap={0.5}>
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

                                                {item.bloqueado && (
                                                    <Chip
                                                        icon={<Shield size={12} />}
                                                        label="Bloqueado"
                                                        size="small"
                                                        sx={{
                                                            fontSize: '0.65rem',
                                                            height: 22,
                                                            bgcolor: '#fee2e2',
                                                            color: '#991b1b',
                                                            fontWeight: '600',
                                                            '& .MuiChip-icon': { color: '#dc2626' }
                                                        }}
                                                    />
                                                )}
                                            </Box>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box display="flex" gap={1} justifyContent="center">
                                                <IconButton size="small" color="primary" onClick={() => { setForm({ ...item, areaId: item.area.id }); setModalOpen(true); }}><Edit size={16} /></IconButton>
                                                <Can I="LOCALIZACAO_EXCLUIR">
                                                    <IconButton size="small" color="error" onClick={() => handleDelete(item.id)}><Trash2 size={16} /></IconButton>
                                                </Can>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* 4. MODAL DE CADASTRO INDIVIDUAL */}
            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>{form.id ? 'Editar Endereço' : 'Novo Endereço'}</DialogTitle>
                <DialogContent dividers>
                    <Grid container spacing={3}>
                        <Grid item xs={12}><Typography variant="subtitle2" color="primary">IDENTIFICAÇÃO</Typography></Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField label="Código (Sufixo)" value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} fullWidth required helperText="Ex: 01-A" />
                        </Grid>
                        <Grid item xs={12} sm={8}>
                            <TextField label="Descrição" value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} fullWidth />
                        </Grid>
                        <Grid item xs={12}><Typography variant="subtitle2" color="primary" mt={1}>CARACTERÍSTICAS</Typography></Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField select label="Tipo Lógico" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })} fullWidth>{TIPOS_LOCAL.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField select label="Estrutura" value={form.tipoEstrutura} onChange={e => setForm({ ...form, tipoEstrutura: e.target.value })} fullWidth>{TIPOS_ESTRUTURA.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}</TextField>
                        </Grid>
                        <Grid item xs={4}><TextField label="Cap. Pallets" type="number" value={form.capacidadeLpn} onChange={e => setForm({ ...form, capacidadeLpn: e.target.value })} fullWidth /></Grid>
                        <Grid item xs={4}><TextField label="Peso Máx (kg)" type="number" value={form.capacidadePesoKg} onChange={e => setForm({ ...form, capacidadePesoKg: e.target.value })} fullWidth /></Grid>
                        {['BLOCADO', 'DRIVE_IN', 'PUSH_BACK'].includes(form.tipoEstrutura) && (
                            <Grid item xs={4}><TextField label="Altura Máx" type="number" value={form.capacidadeMaxima} onChange={e => setForm({ ...form, capacidadeMaxima: e.target.value })} fullWidth helperText="Níveis" /></Grid>
                        )}
                        <Grid item xs={12}><Typography variant="subtitle2" color="primary" mt={1}>REGRAS E STATUS</Typography></Grid>
                        <Grid item xs={12}>
                            <Box display="flex" gap={2} flexWrap="wrap" bgcolor="#f8fafc" p={2} borderRadius={2} border="1px solid #e2e8f0">
                                <FormControlLabel control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} color="success" />} label="Ativo" />
                                <FormControlLabel control={<Switch checked={form.bloqueado} onChange={e => setForm({ ...form, bloqueado: e.target.checked })} color="error" />} label="Bloqueado" />
                                <FormControlLabel control={<Switch checked={form.virtual} onChange={e => setForm({ ...form, virtual: e.target.checked })} />} label="Virtual" />
                                <FormControlLabel control={<Switch checked={form.permiteMultiLpn} onChange={e => setForm({ ...form, permiteMultiLpn: e.target.checked })} />} label="Multi-LPN" />
                            </Box>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSave}>Salvar</Button>
                </DialogActions>
            </Dialog>

            {/* 5. MODAL DE EDIÇÃO EM MASSA UNIFICADO */}
            <Dialog open={bulkModalOpen} onClose={() => setBulkModalOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle>Edição em Massa ({selectedIds.length} itens)</DialogTitle>
                <DialogContent dividers>
                    <Alert severity="info" sx={{ mb: 3 }}>
                        Preencha apenas os campos que deseja alterar. Campos vazios não serão modificados.
                    </Alert>

                    <Grid container spacing={3}>
                        {/* TIPOS */}
                        <Grid item xs={12} sm={6}>
                            <TextField select label="Tipo Lógico" value={bulkForm.tipo} onChange={e => setBulkForm({ ...bulkForm, tipo: e.target.value })} fullWidth InputLabelProps={{ shrink: true }}>
                                <MenuItem value=""><em>-- Não Alterar --</em></MenuItem>
                                {TIPOS_LOCAL.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField select label="Estrutura" value={bulkForm.estrutura} onChange={e => setBulkForm({ ...bulkForm, estrutura: e.target.value })} fullWidth InputLabelProps={{ shrink: true }}>
                                <MenuItem value=""><em>-- Não Alterar --</em></MenuItem>
                                {TIPOS_ESTRUTURA.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                            </TextField>
                        </Grid>

                        {/* CAPACIDADES */}
                        <Grid item xs={12} sm={4}>
                            <TextField label="Nova Cap. Pallets" type="number" value={bulkForm.capacidadeLpn} onChange={e => setBulkForm({ ...bulkForm, capacidadeLpn: e.target.value })} fullWidth placeholder="Manter" InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField label="Novo Peso (kg)" type="number" value={bulkForm.capacidadePeso} onChange={e => setBulkForm({ ...bulkForm, capacidadePeso: e.target.value })} fullWidth placeholder="Manter" InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField label="Nova Altura (Blocados)" type="number" value={bulkForm.capacidadeMaxima} onChange={e => setBulkForm({ ...bulkForm, capacidadeMaxima: e.target.value })} fullWidth placeholder="Manter" InputLabelProps={{ shrink: true }} helperText="Só aplica em Blocado" />
                        </Grid>

                        {/* REGRAS (3 Estados) */}
                        <Grid item xs={12}><Typography variant="subtitle2" color="text.secondary">STATUS E REGRAS</Typography></Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField select label="Ativo?" value={bulkForm.ativo} onChange={e => setBulkForm({ ...bulkForm, ativo: e.target.value })} fullWidth size="small" InputLabelProps={{ shrink: true }}>
                                <MenuItem value=""><em>Manter</em></MenuItem>
                                <MenuItem value="true">Sim (Ativar)</MenuItem>
                                <MenuItem value="false">Não (Inativar)</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField select label="Bloqueado?" value={bulkForm.bloqueado} onChange={e => setBulkForm({ ...bulkForm, bloqueado: e.target.value })} fullWidth size="small" InputLabelProps={{ shrink: true }}>
                                <MenuItem value=""><em>Manter</em></MenuItem>
                                <MenuItem value="true">Sim (Bloquear)</MenuItem>
                                <MenuItem value="false">Não (Desbloquear)</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField select label="Virtual?" value={bulkForm.virtualLocation} onChange={e => setBulkForm({ ...bulkForm, virtualLocation: e.target.value })} fullWidth size="small" InputLabelProps={{ shrink: true }}>
                                <MenuItem value=""><em>Manter</em></MenuItem>
                                <MenuItem value="true">Sim</MenuItem>
                                <MenuItem value="false">Não</MenuItem>
                            </TextField>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField select label="Multi-LPN?" value={bulkForm.permiteMultiLpn} onChange={e => setBulkForm({ ...bulkForm, permiteMultiLpn: e.target.value })} fullWidth size="small" InputLabelProps={{ shrink: true }}>
                                <MenuItem value=""><em>Manter</em></MenuItem>
                                <MenuItem value="true">Sim</MenuItem>
                                <MenuItem value="false">Não</MenuItem>
                            </TextField>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBulkModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleBulkSubmit}>Aplicar Alterações</Button>
                </DialogActions>
            </Dialog>

            {/* MODAL IMPORTAÇÃO */}
            <Dialog open={importModalOpen} onClose={() => setImportModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Importar Localizações</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        CSV: ARMAZEM; AREA; CODIGO; DESCRICAO; TIPO; ESTRUTURA; CAP_LPN; CAP_KG; CAP_EMPILHAMENTO; ATIVO; BLOQUEADO; VIRTUAL; MULTI_LPN
                    </Alert>
                    <Box component="label" sx={{ p: 4, border: '2px dashed #ccc', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', '&:hover': { borderColor: 'primary.main', bgcolor: '#f0f9ff' } }}>
                        <input type="file" hidden accept=".csv" onChange={e => setFile(e.target.files[0])} />
                        <FileSpreadsheet size={40} color={file ? "#2563eb" : "#64748b"} />
                        <Typography mt={2}>{file ? file.name : "Clique para selecionar arquivo CSV"}</Typography>
                    </Box>
                    <Box mt={3} display="flex" justifyContent="center">
                        <Button variant="text" startIcon={<Download size={16} />} onClick={handleDownloadModel}>Baixar Planilha Modelo</Button>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setImportModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleImport} disabled={!file || loading}>Importar</Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={confirmOpen} onClose={() => setConfirmOpen(false)}
                onConfirm={confirmData.action} title={confirmData.title || ''}
                message={confirmData.message || ''}
                severity={confirmData.title && confirmData.title.includes('Excluir') ? "error" : "primary"}
            />
        </Box>
    );
};

export default LocalizacaoList;