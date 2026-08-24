import { useState, useEffect, useContext } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Box, Typography, Checkbox, FormControlLabel,
    Grid, Divider, Paper
} from '@mui/material';
import { getPermissoesDisponiveis, salvarPerfil } from '../../services/usuarioService';
import { toast } from 'react-toastify';
import { AuthContext } from '../../contexts/AuthContext';

const PerfilForm = ({ open, onClose, perfil, onSuccess }) => {
    const { forceUpdatePermissions } = useContext(AuthContext); // Hook para forçar atualização de permissões
    const [form, setForm] = useState({ nome: '', descricao: '', permissoes: [] });
    const [opcoesPermissoes, setOpcoesPermissoes] = useState({}); // Mapa agrupado
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        carregarPermissoes();
        if (perfil) {
            setForm({ ...perfil }); // Preenche se for edição
        } else {
            setForm({ nome: '', descricao: '', permissoes: [] });
        }
    }, [perfil]);

    const carregarPermissoes = async () => {
        try {
            const data = await getPermissoesDisponiveis();
            setOpcoesPermissoes(data);
        } catch (error) {
            toast.error("Erro ao carregar permissões do sistema");
        }
    };

    const handleToggle = (perm) => {
        setForm(prev => {
            const jaTem = prev.permissoes.includes(perm);
            return {
                ...prev,
                permissoes: jaTem
                    ? prev.permissoes.filter(p => p !== perm) // Remove
                    : [...prev.permissoes, perm] // Adiciona
            };
        });
    };

    const handleSelectAllGroup = (grupo, todasDoGrupo) => {
        const jaTemTodas = todasDoGrupo.every(p => form.permissoes.includes(p));

        setForm(prev => {
            let novas = [...prev.permissoes];
            if (jaTemTodas) {
                // Remove todas do grupo
                novas = novas.filter(p => !todasDoGrupo.includes(p));
            } else {
                // Adiciona as que faltam
                todasDoGrupo.forEach(p => {
                    if (!novas.includes(p)) novas.push(p);
                });
            }
            return { ...prev, permissoes: novas };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await salvarPerfil(form);
            toast.success("Perfil salvo com sucesso!");

            // MÁGICA: Atualiza as permissões do usuário logado imediatamente
            // (Caso o perfil alterado seja o dele, já aplica na hora)
            await forceUpdatePermissions();

            onSuccess();
        } catch (error) {
            toast.error("Erro ao salvar perfil");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{perfil ? "Editar Perfil" : "Novo Perfil de Acesso"}</DialogTitle>
            <form onSubmit={handleSubmit}>
                <DialogContent dividers>
                    <Box display="flex" gap={2} mb={3}>
                        <TextField
                            label="Nome do Perfil"
                            fullWidth
                            value={form.nome}
                            onChange={e => setForm({ ...form, nome: e.target.value })}
                            required
                            placeholder="Ex: Gerente de Estoque"
                        />
                        <TextField
                            label="Descrição"
                            fullWidth
                            value={form.descricao}
                            onChange={e => setForm({ ...form, descricao: e.target.value })}
                        />
                    </Box>

                    <Typography variant="subtitle2" color="text.secondary" mb={2}>
                        Selecione as ações permitidas para este perfil:
                    </Typography>

                    <Box sx={{ maxHeight: 400, overflowY: 'auto', pr: 1 }}>
                        {Object.keys(opcoesPermissoes).map((grupo) => (
                            <Paper key={grupo} variant="outlined" sx={{ mb: 2, p: 2, borderRadius: 2 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                    <Typography variant="subtitle1" fontWeight="bold" color="primary">
                                        {grupo}
                                    </Typography>
                                    <Button
                                        size="small"
                                        onClick={() => handleSelectAllGroup(grupo, opcoesPermissoes[grupo])}
                                    >
                                        Alternar Todos
                                    </Button>
                                </Box>
                                <Divider sx={{ mb: 1 }} />
                                <Grid container>
                                    {opcoesPermissoes[grupo].map(perm => (
                                        <Grid item xs={12} sm={6} md={4} key={perm}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={form.permissoes.includes(perm)}
                                                        onChange={() => handleToggle(perm)}
                                                        size="small"
                                                    />
                                                }
                                                label={
                                                    <Typography variant="body2">
                                                        {perm.replace(`${grupo}_`, '').replace(/_/g, ' ')}
                                                    </Typography>
                                                }
                                            />
                                        </Grid>
                                    ))}
                                </Grid>
                            </Paper>
                        ))}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>Cancelar</Button>
                    <Button type="submit" variant="contained" disabled={loading || !form.nome}>
                        Salvar Perfil
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default PerfilForm;