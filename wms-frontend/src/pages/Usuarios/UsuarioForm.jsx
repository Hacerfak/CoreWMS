import { useState, useEffect, useContext, useMemo } from 'react'; // <--- Adicionado useMemo
import {
    Box, Button, TextField, Grid, Paper, Typography, Divider,
    Tabs, Tab, IconButton, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, MenuItem, CircularProgress, FormControlLabel, Switch, Tooltip
} from '@mui/material';
import {
    Save, ArrowLeft, User, Building2, Trash2, Plus, Lock, KeyRound, CheckCircle
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate, useParams } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import {
    salvarUsuario, getUsuarioById, getEmpresasDoUsuario,
    vincularUsuarioEmpresa, desvincularUsuarioEmpresa, getPerfisDaEmpresa
} from '../../services/usuarioService';
import { getTodasEmpresas } from '../../services/empresaService';
import SearchableSelect from '../../components/SearchableSelect';
import ConfirmDialog from '../../components/ConfirmDialog';

const UsuarioForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, userCan } = useContext(AuthContext);

    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(false);

    // Estados do ConfirmDialog
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);

    const isMaster = user?.role === 'ADMIN';
    const canManageUsers = isMaster || userCan('USUARIO_EDITAR');
    const isSelf = user?.id === Number(id);

    useEffect(() => {
        if (id && !isSelf && !canManageUsers) {
            toast.error("Acesso negado.");
            navigate('/dashboard');
        }
    }, [id, isSelf, canManageUsers, navigate]);

    const [form, setForm] = useState({ nome: '', login: '', email: '', senha: '', ativo: true, adminMaster: false });

    const [meusAcessos, setMeusAcessos] = useState([]);
    const [todasEmpresas, setTodasEmpresas] = useState([]);
    const [novoAcesso, setNovoAcesso] = useState({ empresaId: '', perfilId: '' });
    const [perfisDisponiveis, setPerfisDisponiveis] = useState([]);
    const [loadingPerfis, setLoadingPerfis] = useState(false);

    useEffect(() => {
        if (id) {
            loadUsuario();
            if (canManageUsers) {
                loadAcessos();
                loadListaEmpresas();
            }
        }
    }, [id, canManageUsers]);

    // --- LÓGICA DE FILTRAGEM ---
    // Calcula quais empresas o usuário AINDA NÃO tem
    const empresasDisponiveis = useMemo(() => {
        return todasEmpresas.filter(emp =>
            !meusAcessos.some(acesso => acesso.id === emp.value)
        );
    }, [todasEmpresas, meusAcessos]);

    // --- AUTO-SELEÇÃO INTELIGENTE ---
    // Seleciona a primeira empresa disponível se o campo estiver vazio
    useEffect(() => {
        if (empresasDisponiveis.length > 0 && !novoAcesso.empresaId) {
            setNovoAcesso(prev => ({ ...prev, empresaId: empresasDisponiveis[0].value }));
        }
    }, [empresasDisponiveis, novoAcesso.empresaId]);

    // Carrega perfis quando a empresa selecionada muda
    useEffect(() => {
        if (novoAcesso.empresaId) {
            loadPerfisDaEmpresa(novoAcesso.empresaId);
        } else {
            setPerfisDisponiveis([]);
            setNovoAcesso(prev => ({ ...prev, perfilId: '' }));
        }
    }, [novoAcesso.empresaId]);

    const loadUsuario = async () => {
        try {
            const data = await getUsuarioById(id);
            setForm({ ...data, senha: '' });
        } catch (error) { toast.error("Erro ao carregar usuário."); }
    };

    const loadAcessos = async () => {
        try {
            const data = await getEmpresasDoUsuario(id);
            setMeusAcessos(data);
        } catch (error) { console.error("Erro acessos", error); }
    };

    const loadListaEmpresas = async () => {
        try {
            const data = await getTodasEmpresas();
            const options = data.map(e => ({ value: e.id, label: `${e.razaoSocial} (${e.cnpj})` }));
            setTodasEmpresas(options);
            // Removi a auto-seleção daqui, agora ela é feita pelo useEffect 'empresasDisponiveis'
        } catch (error) { console.error("Erro lista empresas", error); }
    };

    const loadPerfisDaEmpresa = async (empresaId) => {
        setLoadingPerfis(true);
        try {
            const perfis = await getPerfisDaEmpresa(empresaId);
            setPerfisDisponiveis(perfis);
            if (perfis.length > 0) {
                setNovoAcesso(prev => ({ ...prev, perfilId: perfis[0].id }));
            } else {
                setNovoAcesso(prev => ({ ...prev, perfilId: '' }));
            }
        } catch (error) {
            toast.error("Erro ao buscar perfis.");
            setPerfisDisponiveis([]);
        } finally {
            setLoadingPerfis(false);
        }
    };

    const handleSaveUsuario = async () => {
        if (!form.nome || !form.login) return toast.warning("Nome e Login são obrigatórios.");
        setLoading(true);
        try {
            const salvo = await salvarUsuario({ ...form, id });
            toast.success("Dados salvos!");
            if (!id) navigate(`/usuarios/${salvo.id}`);
        } catch (error) {
            toast.error(error.response?.data?.message || "Erro ao salvar.");
        } finally { setLoading(false); }
    };

    const handleAddAcesso = async () => {
        if (!novoAcesso.empresaId || !novoAcesso.perfilId) return toast.warning("Selecione empresa e perfil.");
        try {
            await vincularUsuarioEmpresa(id, novoAcesso.empresaId, novoAcesso.perfilId);
            toast.success("Acesso concedido!");

            // Reseta o form. O useEffect vai selecionar a próxima empresa disponível automaticamente.
            setNovoAcesso({ empresaId: '', perfilId: '' });

            loadAcessos();
        } catch (error) { toast.error("Erro ao vincular."); }
    };

    const handleRemoveClick = (empresaId) => {
        setPendingAction(() => async () => {
            try {
                await desvincularUsuarioEmpresa(id, empresaId);
                toast.success("Acesso removido.");
                loadAcessos();
            } catch (error) {
                toast.error(error.response?.data?.message || "Erro ao remover acesso.");
            }
        });
        setConfirmOpen(true);
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate(canManageUsers ? '/usuarios' : '/dashboard')} color="inherit" variant="outlined">
                        Voltar
                    </Button>
                    <Box>
                        <Typography variant="h5" fontWeight="bold">{id ? 'Editar Usuário' : 'Novo Usuário'}</Typography>
                        <Typography variant="body2" color="text.secondary">{id ? form.nome : 'Cadastro inicial'}</Typography>
                    </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={2}>
                    <FormControlLabel
                        control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} disabled={!canManageUsers} />}
                        label="Ativo"
                    />
                    <Button variant="contained" startIcon={<Save size={20} />} onClick={handleSaveUsuario} disabled={loading}>
                        Salvar Dados
                    </Button>
                </Box>
            </Box>

            <Paper sx={{ width: '100%', mb: 2, borderRadius: 2, overflow: 'hidden' }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: '#f8fafc' }}>
                    <Tab label="Dados Pessoais" icon={<User size={18} />} iconPosition="start" />
                    {id && canManageUsers && (
                        <Tab label="Acessos & Empresas" icon={<Building2 size={18} />} iconPosition="start" />
                    )}
                </Tabs>

                <Box sx={{ p: 4 }}>
                    {activeTab === 0 && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6}><TextField label="Nome Completo" fullWidth required value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Email" fullWidth value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Grid>
                            <Grid item xs={12}><Divider /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Login" fullWidth required value={form.login} onChange={e => setForm({ ...form, login: e.target.value })} disabled={!!id && !isMaster} helperText={id && !isMaster ? "Apenas Admin Master pode alterar login." : ""} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Senha" type="password" fullWidth required={!id} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} InputProps={{ startAdornment: <Lock size={18} color="#94a3b8" style={{ marginRight: 8 }} /> }} /></Grid>
                        </Grid>
                    )}

                    {activeTab === 1 && canManageUsers && (
                        <Box>
                            {/* EXIBE O CARTÃO APENAS SE HOUVER EMPRESAS DISPONÍVEIS */}
                            {empresasDisponiveis.length > 0 ? (
                                <Paper variant="outlined" sx={{ p: 3, mb: 4, bgcolor: '#f8fafc', borderColor: 'primary.light' }}>
                                    <Typography variant="subtitle2" fontWeight="bold" color="primary" mb={2} display="flex" alignItems="center" gap={1}>
                                        <KeyRound size={18} /> Conceder Novo Acesso
                                    </Typography>
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={12} md={6}>
                                            <SearchableSelect
                                                label="Selecione a Empresa"
                                                value={novoAcesso.empresaId}
                                                onChange={e => setNovoAcesso({ ...novoAcesso, empresaId: e.target.value })}
                                                options={empresasDisponiveis} // Usa a lista filtrada
                                            />
                                        </Grid>
                                        <Grid item xs={12} md={4}>
                                            <TextField select label="Perfil de Acesso" fullWidth value={novoAcesso.perfilId} onChange={e => setNovoAcesso({ ...novoAcesso, perfilId: e.target.value })} disabled={!novoAcesso.empresaId || loadingPerfis} InputProps={{ endAdornment: loadingPerfis && <CircularProgress size={16} sx={{ mr: 2 }} /> }}>
                                                {perfisDisponiveis.map(p => <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>)}
                                            </TextField>
                                        </Grid>
                                        <Grid item xs={12} md={2}>
                                            <Button variant="contained" fullWidth onClick={handleAddAcesso} startIcon={<Plus size={18} />} sx={{ height: 56 }}>Adicionar</Button>
                                        </Grid>
                                    </Grid>
                                </Paper>
                            ) : (
                                <Box mb={4} p={3} bgcolor="#f0fdf4" borderRadius={2} border="1px solid #bbf7d0" display="flex" alignItems="center" gap={2}>
                                    <CheckCircle size={24} color="#16a34a" />
                                    <Typography color="success.main" fontWeight="500">
                                        Este usuário já possui acesso a todas as empresas cadastradas.
                                    </Typography>
                                </Box>
                            )}

                            <Divider sx={{ mb: 3 }} />
                            <Typography variant="h6" gutterBottom>Empresas Vinculadas</Typography>
                            <TableContainer component={Paper} variant="outlined">
                                <Table>
                                    <TableHead sx={{ bgcolor: 'background.subtle' }}>
                                        <TableRow><TableCell>Empresa</TableCell><TableCell>CNPJ</TableCell><TableCell>Perfil</TableCell><TableCell align="center">Ações</TableCell></TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {meusAcessos.map((acesso) => (
                                            <TableRow key={acesso.id}>
                                                <TableCell><b>{acesso.razaoSocial}</b></TableCell>
                                                <TableCell>{acesso.cnpj}</TableCell>
                                                <TableCell><Chip label={acesso.perfil} color="primary" variant="outlined" size="small" /></TableCell>
                                                <TableCell align="center">
                                                    <span title={isSelf ? "Você não pode remover seu próprio acesso" : (form.adminMaster ? "Não é possível remover vínculos do Master" : "Remover Acesso")}>
                                                        <IconButton
                                                            size="small"
                                                            color="error"
                                                            onClick={() => handleRemoveClick(acesso.id)}
                                                            disabled={isSelf || form.adminMaster}
                                                        >
                                                            <Trash2 size={18} />
                                                        </IconButton>
                                                    </span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {meusAcessos.length === 0 && (
                                            <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.secondary' }}>Este usuário não tem acesso a nenhuma empresa.</TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    )}
                </Box>
            </Paper>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={pendingAction}
                title="Remover Acesso"
                message="Tem certeza que deseja remover o acesso deste usuário a esta empresa?"
            />
        </Box>
    );
};

export default UsuarioForm;