import { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, IconButton, Tooltip, LinearProgress,
    TextField, InputAdornment, Chip, Avatar
} from '@mui/material';
import { Plus, Edit, Trash2, Search, User, Shield, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getUsuarios, excluirUsuario } from '../../services/usuarioService';
import ConfirmDialog from '../../components/ConfirmDialog';
import Can from '../../components/Can';

const UsuariosList = () => {
    const navigate = useNavigate();
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [idToDelete, setIdToDelete] = useState(null);

    useEffect(() => { load(); }, []);

    const load = async () => {
        setLoading(true);
        try {
            const data = await getUsuarios();
            setUsuarios(data);
        } catch (error) { toast.error("Erro ao carregar usuários."); }
        finally { setLoading(false); }
    };

    const handleDelete = async () => {
        try {
            await excluirUsuario(idToDelete);
            toast.success("Usuário excluído.");
            load();
        } catch (error) { toast.error(error.response?.data?.message || "Erro ao excluir."); }
        finally { setConfirmOpen(false); }
    };

    const filteredUsers = useMemo(() => {
        const term = busca.toLowerCase();
        return usuarios.filter(u =>
            u.login.toLowerCase().includes(term) ||
            (u.nome && u.nome.toLowerCase().includes(term)) ||
            (u.email && u.email.toLowerCase().includes(term))
        );
    }, [usuarios, busca]);

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Gestão de Usuários</Typography>
                    <Typography variant="body2" color="text.secondary">Cadastre usuários e gerencie seus acessos às empresas.</Typography>
                </Box>
                <Can I="USUARIO_CRIAR">
                    <Button variant="contained" startIcon={<Plus size={20} />} onClick={() => navigate('/usuarios/novo')}>
                        Novo Usuário
                    </Button>
                </Can>
            </Box>

            <Paper sx={{ width: '100%', mb: 2, p: 2, borderRadius: 2 }}>
                <TextField
                    fullWidth
                    placeholder="Buscar por Nome, Login ou Email..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    size="small"
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Search size={18} color="#94a3b8" /></InputAdornment>
                    }}
                />
            </Paper>

            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                {loading && <LinearProgress />}
                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: 'background.subtle' }}>
                            <TableRow>
                                <TableCell><b>Usuário</b></TableCell>
                                <TableCell><b>Login</b></TableCell>
                                <TableCell><b>Email</b></TableCell>
                                <TableCell><b>Perfil Global</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredUsers.map((u) => (
                                <TableRow key={u.id} hover>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                            <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', fontSize: '0.8rem' }}>
                                                {u.nome ? u.nome.charAt(0).toUpperCase() : <User size={16} />}
                                            </Avatar>
                                            <Typography fontWeight={500} variant="body2">{u.nome || 'Sem Nome'}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{u.login}</TableCell>
                                    <TableCell>{u.email || '-'}</TableCell>
                                    <TableCell>
                                        {u.adminMaster ? <Chip label="MASTER" color="error" size="small" icon={<Shield size={14} />} /> : <Chip label="Comum" size="small" />}
                                    </TableCell>
                                    <TableCell align="center">

                                        {/* BLINDAGEM VISUAL: Se for Master, esconde ações */}
                                        {!u.adminMaster && u.login !== 'master' ? (
                                            <Box display="flex" justifyContent="center" gap={1}>
                                                <Can I="USUARIO_EDITAR">
                                                    <Tooltip title="Gerenciar Dados e Acessos">
                                                        <IconButton size="small" color="primary" onClick={() => navigate(`/usuarios/${u.id}`)}>
                                                            <Edit size={18} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Can>
                                                <Can I="USUARIO_EXCLUIR">
                                                    <IconButton size="small" color="error" onClick={() => { setIdToDelete(u.id); setConfirmOpen(true); }}>
                                                        <Trash2 size={18} />
                                                    </IconButton>
                                                </Can>
                                            </Box>
                                        ) : (
                                            <Tooltip title="Usuário Protegido">
                                                <Lock size={18} color="#cbd5e1" style={{ margin: 'auto', display: 'block' }} />
                                            </Tooltip>
                                        )}

                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && filteredUsers.length === 0 && (
                                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 3 }}>Nenhum usuário encontrado.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleDelete}
                title="Excluir Usuário"
                message="Isso removerá o acesso do usuário a TODAS as empresas. Continuar?"
            />
        </Box>
    );
};

export default UsuariosList;