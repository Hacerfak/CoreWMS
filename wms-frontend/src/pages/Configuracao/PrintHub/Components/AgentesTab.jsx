import { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Chip, Dialog, DialogTitle, DialogContent, TextField, DialogActions,
    Alert, Typography, FormControlLabel, Switch
} from '@mui/material';
import { Plus, Trash2, Copy, Edit, Server } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAgentes, criarAgente, atualizarAgente, excluirAgente } from '../../../../services/printHubService';
import ConfirmDialog from '../../../../components/ConfirmDialog';

const AgentesTab = () => {
    const [agentes, setAgentes] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [novoAgenteResponse, setNovoAgenteResponse] = useState(null); // Guarda a key após criar

    // Form unificado para criar e editar
    const [form, setForm] = useState({ id: null, nome: '', hostname: '', descricao: '', ativo: true });

    const [confirmOpen, setConfirmOpen] = useState(false);
    const [idToDelete, setIdToDelete] = useState(null);

    // Polling a cada 15s para ver status ONLINE/OFFLINE quase em tempo real
    useEffect(() => {
        load();
        const interval = setInterval(load, 600000);
        return () => clearInterval(interval);
    }, []);

    const load = async () => {
        try {
            const data = await getAgentes();
            setAgentes(data);
        } catch (e) { console.error("Erro polling agentes", e); }
    };

    const handleOpenNew = () => {
        setForm({ id: null, nome: '', hostname: '', descricao: '', ativo: true });
        setNovoAgenteResponse(null);
        setModalOpen(true);
    };

    const handleOpenEdit = (agente) => {
        setForm({
            id: agente.id,
            nome: agente.nome,
            hostname: agente.hostname,
            descricao: agente.descricao,
            ativo: agente.ativo
        });
        setNovoAgenteResponse(null);
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!form.nome || !form.hostname) return toast.warning("Nome e Hostname são obrigatórios");

        try {
            if (form.id) {
                // EDIÇÃO
                await atualizarAgente(form.id, {
                    nome: form.nome,
                    hostname: form.hostname,
                    descricao: form.descricao
                }, form.ativo);
                toast.success("Agente atualizado!");
                setModalOpen(false);
            } else {
                // CRIAÇÃO
                const res = await criarAgente({
                    nome: form.nome,
                    hostname: form.hostname,
                    descricao: form.descricao
                });
                setNovoAgenteResponse(res); // Mantém modal aberto para mostrar a KEY
                // Limpa form mas não fecha modal ainda
                setForm({ ...form, id: res.id });
            }
            load();
        } catch (e) {
            toast.error(e.response?.data?.message || "Erro ao salvar agente");
        }
    };

    const handleDelete = async () => {
        try {
            await excluirAgente(idToDelete);
            toast.success("Agente excluído permanentemente!");
            load();
        } catch (e) { toast.error("Erro ao excluir"); }
    };

    const copyKey = () => {
        if (novoAgenteResponse?.apiKey) {
            navigator.clipboard.writeText(novoAgenteResponse.apiKey);
            toast.success("Copiado!");
        }
    };

    return (
        <Box>
            <Box display="flex" justifyContent="flex-end" mb={2}>
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleOpenNew}>Novo Agente</Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.subtle' }}>
                        <TableRow>
                            <TableCell>Status</TableCell>
                            <TableCell>Nome (ID)</TableCell>
                            <TableCell>Hostname</TableCell>
                            <TableCell>Versão</TableCell>
                            <TableCell>Último Contato</TableCell>
                            <TableCell>Situação</TableCell>
                            <TableCell align="center">Ações</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {agentes.map(a => (
                            <TableRow key={a.id} sx={{ opacity: a.ativo ? 1 : 0.6 }}>
                                <TableCell>
                                    <Chip
                                        label={a.statusConexao}
                                        color={a.statusConexao === 'ONLINE' ? 'success' : 'default'}
                                        size="small"
                                        variant="filled"
                                        sx={{ fontWeight: 'bold', minWidth: 70 }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Server size={16} color="#64748b" />
                                        <b>{a.nome}</b>
                                    </Box>
                                    {a.descricao && <Typography variant="caption" color="text.secondary" display="block">{a.descricao}</Typography>}
                                </TableCell>
                                <TableCell>{a.hostname || '-'}</TableCell>
                                <TableCell>{a.versaoAgente || '-'}</TableCell>
                                <TableCell>
                                    {a.ultimoHeartbeat ? new Date(a.ultimoHeartbeat).toLocaleString() : '-'}
                                </TableCell>
                                <TableCell>
                                    {a.ativo
                                        ? <Typography variant="caption" color="success.main" fontWeight="bold">ATIVO</Typography>
                                        : <Typography variant="caption" color="error" fontWeight="bold">INATIVO</Typography>
                                    }
                                </TableCell>
                                <TableCell align="center">
                                    <Box display="flex" justifyContent="center" gap={1}>
                                        <IconButton size="small" color="primary" onClick={() => handleOpenEdit(a)}>
                                            <Edit size={16} />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => { setIdToDelete(a.id); setConfirmOpen(true); }}>
                                            <Trash2 size={16} />
                                        </IconButton>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                        {agentes.length === 0 && (
                            <TableRow><TableCell colSpan={7} align="center" sx={{ py: 3 }}>Nenhum agente configurado.</TableCell></TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Modal de Criação / Edição */}
            <Dialog open={modalOpen} onClose={() => !novoAgenteResponse && setModalOpen(false)} maxWidth="sm" fullWidth>
                {!novoAgenteResponse ? (
                    <>
                        <DialogTitle>{form.id ? 'Editar Agente' : 'Novo Agente'}</DialogTitle>
                        <DialogContent dividers>
                            <Box display="flex" flexDirection="column" gap={2} mt={1}>
                                <TextField
                                    label="Nome (ID Único)"
                                    fullWidth required
                                    value={form.nome}
                                    onChange={e => setForm({ ...form, nome: e.target.value })}
                                    helperText="Identificador usado no arquivo de configuração do agente."
                                />
                                <TextField
                                    label="Hostname / IP"
                                    fullWidth required
                                    value={form.hostname}
                                    onChange={e => setForm({ ...form, hostname: e.target.value })}
                                    helperText="Nome da máquina onde o serviço está instalado."
                                />
                                <TextField
                                    label="Descrição"
                                    fullWidth
                                    value={form.descricao}
                                    onChange={e => setForm({ ...form, descricao: e.target.value })}
                                    placeholder="Ex: PC da Expedição - Doca 1"
                                />

                                {form.id && (
                                    <FormControlLabel
                                        control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />}
                                        label="Agente Ativo (Permitir conexão)"
                                    />
                                )}
                            </Box>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                            <Button variant="contained" onClick={handleSave}>Salvar</Button>
                        </DialogActions>
                    </>
                ) : (
                    <>
                        <DialogTitle color="success.main">Agente Criado com Sucesso!</DialogTitle>
                        <DialogContent>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                Copie a chave de API abaixo agora. <br />
                                <strong>Ela não será exibida novamente por segurança.</strong>
                            </Alert>
                            <Paper variant="outlined" sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                                <Typography fontFamily="monospace" fontWeight="bold" sx={{ wordBreak: 'break-all' }}>
                                    {novoAgenteResponse.apiKey}
                                </Typography>
                                <IconButton onClick={copyKey} color="primary"><Copy size={20} /></IconButton>
                            </Paper>
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => { setNovoAgenteResponse(null); setModalOpen(false); }}>Concluir</Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <ConfirmDialog
                open={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={handleDelete}
                title="Excluir Agente"
                message="Tem certeza? O histórico de impressões será mantido, mas o agente perderá acesso imediatamente."
            />
        </Box>
    );
};

export default AgentesTab;