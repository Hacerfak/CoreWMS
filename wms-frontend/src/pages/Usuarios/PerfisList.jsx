import { useState, useEffect } from 'react';
import { Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Chip } from '@mui/material';
import { Plus, Trash2, Edit, Shield } from 'lucide-react';
import { getPerfis, excluirPerfil } from '../../services/usuarioService';
import PerfilForm from './PerfilForm';
import { toast } from 'react-toastify';
import Can from '../../components/Can';
import ConfirmDialog from '../../components/ConfirmDialog'; // <--- Import

const PerfisList = () => {
    const [perfis, setPerfis] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [perfilEditando, setPerfilEditando] = useState(null);

    // Estado do Confirm
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);

    const loadData = async () => {
        try {
            const data = await getPerfis();
            setPerfis(data);
        } catch (error) {
            toast.error("Erro ao carregar perfis");
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleEdit = (perfil) => { setPerfilEditando(perfil); setModalOpen(true); };
    const handleNew = () => { setPerfilEditando(null); setModalOpen(true); };

    // Lógica antiga substituída
    const handleDeleteClick = (id) => {
        setConfirmAction(() => async () => {
            try {
                await excluirPerfil(id);
                toast.success("Perfil excluído");
                loadData();
            } catch (error) {
                toast.error("Erro ao excluir. Verifique se há usuários vinculados.");
            }
        });
        setConfirmOpen(true);
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
                <Typography variant="h5" fontWeight="bold">Perfis de Acesso</Typography>
                <Can I="PERFIL_GERENCIAR">
                    <Button variant="contained" startIcon={<Plus size={20} />} onClick={handleNew}>
                        Novo Perfil
                    </Button>
                </Can>
            </Box>

            <Paper sx={{ width: '100%', borderRadius: 2, overflow: 'hidden' }}>
                <TableContainer>
                    <Table>
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell><b>Nome</b></TableCell>
                                <TableCell><b>Descrição</b></TableCell>
                                <TableCell><b>Permissões</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {perfis.map((p) => (
                                <TableRow key={p.id} hover>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Shield size={16} color="#64748b" />
                                            <Typography fontWeight={500}>{p.nome}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>{p.descricao}</TableCell>
                                    <TableCell><Chip label={`${p.permissoes.length} Ações`} size="small" variant="outlined" /></TableCell>
                                    <TableCell align="center">
                                        <Can I="PERFIL_GERENCIAR">
                                            <IconButton size="small" onClick={() => handleEdit(p)} color="primary"><Edit size={18} /></IconButton>

                                            {/* Botão com nova lógica */}
                                            <IconButton size="small" onClick={() => handleDeleteClick(p.id)} color="error"><Trash2 size={18} /></IconButton>
                                        </Can>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {modalOpen && <PerfilForm open={modalOpen} onClose={() => setModalOpen(false)} perfil={perfilEditando} onSuccess={() => { setModalOpen(false); loadData(); }} />}

            {/* Componente Confirm */}
            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={confirmAction}
                title="Excluir Perfil"
                message="Tem certeza? Usuários vinculados a este perfil perderão o acesso."
            />
        </Box>
    );
};

export default PerfisList;