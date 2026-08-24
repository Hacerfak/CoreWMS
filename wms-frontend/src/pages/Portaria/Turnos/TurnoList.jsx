import { useState, useEffect } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Dialog, DialogTitle, DialogContent, TextField, DialogActions,
    Switch, FormControlLabel, Chip, Checkbox, FormGroup, FormLabel, FormControl, Grid, Typography
} from '@mui/material';
import { Plus, Trash2, ArrowLeft, Edit } from 'lucide-react'; // Adicionado Edit
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { getTurnos, salvarTurno, excluirTurno } from '../../../services/portariaService';

const DIAS_OPTIONS = [
    { label: 'Segunda', value: 'SEG' },
    { label: 'Terça', value: 'TER' },
    { label: 'Quarta', value: 'QUA' },
    { label: 'Quinta', value: 'QUI' },
    { label: 'Sexta', value: 'SEX' },
    { label: 'Sábado', value: 'SAB' },
    { label: 'Domingo', value: 'DOM' }
];

const TurnoList = () => {
    const navigate = useNavigate();
    const [turnos, setTurnos] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);

    const [form, setForm] = useState({
        id: null, // Importante para edição
        nome: '',
        inicio: '',
        fim: '',
        diasSemana: '', // String CSV: "SEG,TER"
        ativo: true
    });

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const data = await getTurnos();
            setTurnos(data);
        } catch (e) { toast.error("Erro ao carregar turnos"); }
    };

    const handleSave = async () => {
        if (!form.nome || !form.inicio || !form.fim || !form.diasSemana) {
            return toast.warning("Preencha todos os campos obrigatórios.");
        }
        try {
            await salvarTurno(form);
            toast.success("Turno salvo!");
            setModalOpen(false);
            load();
        } catch (e) { toast.error("Erro ao salvar."); }
    };

    const handleDelete = async (id) => {
        if (!confirm("Excluir turno?")) return;
        try {
            await excluirTurno(id);
            toast.success("Turno removido.");
            load();
        } catch (e) { toast.error("Erro ao excluir."); }
    };

    const handleNew = () => {
        // Reset do formulário com valores padrão
        setForm({
            id: null,
            nome: '',
            inicio: '08:00',
            fim: '18:00',
            diasSemana: 'SEG,TER,QUA,QUI,SEX',
            ativo: true
        });
        setModalOpen(true);
    };

    const handleEdit = (turno) => {
        setForm({ ...turno }); // Copia os dados para o form
        setModalOpen(true);
    };

    // Lógica para alternar os dias no Checkbox
    const toggleDia = (diaValor) => {
        const diasAtuais = form.diasSemana ? form.diasSemana.split(',') : [];
        let novosDias;

        if (diasAtuais.includes(diaValor)) {
            // Remove
            novosDias = diasAtuais.filter(d => d !== diaValor);
        } else {
            // Adiciona
            novosDias = [...diasAtuais, diaValor];
        }

        // Ordena para manter consistência (Opcional, mas bom para leitura)
        // A ordem do array DIAS_OPTIONS pode ser usada como referência se necessário, 
        // mas aqui vamos apenas juntar.
        setForm({ ...form, diasSemana: novosDias.join(',') });
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Button startIcon={<ArrowLeft />} onClick={() => navigate('/portaria')} color="inherit">Voltar</Button>
                <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleNew}>Novo Turno</Button>
            </Box>

            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.subtle' }}>
                        <TableRow>
                            <TableCell>Nome</TableCell>
                            <TableCell>Início</TableCell>
                            <TableCell>Fim</TableCell>
                            <TableCell>Dias</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="center">Ações</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {turnos.map(t => (
                            <TableRow key={t.id} hover>
                                <TableCell><b>{t.nome}</b></TableCell>
                                <TableCell>{t.inicio}</TableCell>
                                <TableCell>{t.fim}</TableCell>
                                <TableCell>
                                    {/* Exibe dias como Chips pequenos para melhor leitura */}
                                    <Box display="flex" gap={0.5} flexWrap="wrap">
                                        {t.diasSemana.split(',').map(d => (
                                            <Chip key={d} label={d} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />
                                        ))}
                                    </Box>
                                </TableCell>
                                <TableCell><Chip label={t.ativo ? "Ativo" : "Inativo"} color={t.ativo ? "success" : "default"} size="small" /></TableCell>
                                <TableCell align="center">
                                    <Box display="flex" justifyContent="center" gap={1}>
                                        <IconButton size="small" color="primary" onClick={() => handleEdit(t)}>
                                            <Edit size={16} />
                                        </IconButton>
                                        <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}>
                                            <Trash2 size={16} />
                                        </IconButton>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={modalOpen} onClose={() => setModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{form.id ? 'Editar Turno' : 'Novo Turno'}</DialogTitle>
                <DialogContent dividers>
                    <Box display="flex" flexDirection="column" gap={2}>
                        <TextField
                            label="Nome do Turno"
                            fullWidth
                            value={form.nome}
                            onChange={e => setForm({ ...form, nome: e.target.value })}
                            placeholder="Ex: Comercial, Noturno"
                            required
                        />

                        <Box display="flex" gap={2}>
                            <TextField
                                label="Início"
                                type="time"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={form.inicio}
                                onChange={e => setForm({ ...form, inicio: e.target.value })}
                                required
                            />
                            <TextField
                                label="Fim"
                                type="time"
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                value={form.fim}
                                onChange={e => setForm({ ...form, fim: e.target.value })}
                                required
                            />
                        </Box>

                        <FormControl component="fieldset" sx={{ mt: 1, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                            <FormLabel component="legend" sx={{ fontSize: '0.85rem', px: 0.5 }}>Dias de Operação</FormLabel>
                            <FormGroup>
                                <Grid container>
                                    {DIAS_OPTIONS.map((dia) => (
                                        <Grid item xs={6} sm={4} key={dia.value}>
                                            <FormControlLabel
                                                control={
                                                    <Checkbox
                                                        checked={form.diasSemana.split(',').includes(dia.value)}
                                                        onChange={() => toggleDia(dia.value)}
                                                        size="small"
                                                    />
                                                }
                                                label={<Typography variant="body2">{dia.label}</Typography>}
                                            />
                                        </Grid>
                                    ))}
                                </Grid>
                            </FormGroup>
                        </FormControl>

                        <FormControlLabel
                            control={<Switch checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />}
                            label="Turno Ativo"
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleSave}>Salvar</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
export default TurnoList;