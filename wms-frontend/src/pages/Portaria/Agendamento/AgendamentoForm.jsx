import { useState, useEffect } from 'react';
import {
    Box, Stepper, Step, StepLabel, Button, Typography,
    Grid, TextField, FormControl, InputLabel, Select, MenuItem,
    Alert, Dialog, DialogTitle, DialogContent, DialogActions, IconButton
} from '@mui/material';
import { toast } from 'react-toastify';
import api from '../../../services/api';
import SearchableSelect from '../../../components/SearchableSelect'; // Supondo que este componente usa Autocomplete ou Select do MUI
import { getParceiros } from '../../../services/parceiroService';
import { getTurnos } from '../../../services/portariaService';
import { Save, ArrowRight, ArrowLeft, Truck, Calendar, X } from 'lucide-react';

const steps = ['Dados do Agendamento', 'Veículo e Transportadora'];

// Helper para formatar Data
const formatDateTime = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const pad = (n) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const AgendamentoForm = ({ open, onClose, onSuccess, dataInicial, agendamentoId }) => {
    const isEdit = !!agendamentoId;
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);

    // Listas
    const [transportadoras, setTransportadoras] = useState([]);
    const [turnos, setTurnos] = useState([]);

    const [formData, setFormData] = useState({
        tipo: 'ENTRADA',
        dataInicio: '',
        dataFim: '',
        turnoId: '',
        placa: '',
        motoristaNome: '',
        motoristaCpf: '',
        transportadoraId: '',
        docaId: null
    });

    // Resetar form ao abrir
    useEffect(() => {
        if (open) {
            setActiveStep(0);
            loadDependencies();

            if (isEdit) {
                loadAgendamento(agendamentoId);
            } else {
                // Configuração Inicial
                const now = new Date();

                if (dataInicial?.data && dataInicial.data !== formatDateTime(now).split('T')[0]) {
                    const filterDate = new Date(dataInicial.data);
                    filterDate.setHours(now.getHours(), now.getMinutes());
                    now.setTime(filterDate.getTime());
                }

                const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

                setFormData(prev => ({
                    ...prev,
                    tipo: 'ENTRADA',
                    dataInicio: formatDateTime(now),
                    dataFim: formatDateTime(oneHourLater),
                    turnoId: '', // Será preenchido pelo autoSelect ou loadDependencies
                    placa: '',
                    motoristaNome: '',
                    motoristaCpf: '',
                    transportadoraId: '', // Será preenchido pelo loadDependencies se só houver 1
                    docaId: null
                }));
            }
        }
    }, [open, agendamentoId, dataInicial]);

    // Lógica Automática de Turno (Monitora dataInicio)
    useEffect(() => {
        if (formData.dataInicio && turnos.length > 0 && !isEdit) {
            autoSelectTurno(formData.dataInicio);
        }
    }, [formData.dataInicio, turnos, isEdit]);

    const loadDependencies = async () => {
        try {
            const allParceiros = await getParceiros();
            // Filtra apenas transportadoras
            const transps = allParceiros
                .filter(p => p.tipo === 'TRANSPORTADORA' || p.tipo === 'AMBOS')
                .map(p => ({ value: p.id, label: p.nome }));
            setTransportadoras(transps);

            // Pré-seleção inteligente: Se houver transportadoras, seleciona a primeira (ou se só tiver uma)
            // Se for edição, mantém o que veio do banco (tratado no loadAgendamento)
            if (!isEdit && transps.length > 0) {
                setFormData(prev => ({ ...prev, transportadoraId: transps[0].value }));
            }

            const turnosData = await getTurnos();
            setTurnos(turnosData);
        } catch (e) { console.error("Erro ao carregar listas", e); }
    };

    const loadAgendamento = async (id) => {
        setLoading(true);
        try {
            const { data } = await api.get(`/api/portaria/agenda/${id}`);
            setFormData({
                ...data,
                dataInicio: data.dataPrevistaInicio,
                dataFim: data.dataPrevistaFim,
                transportadoraId: data.transportadora?.id || '',
                turnoId: data.turno?.id || '',
                docaId: data.doca?.id || null
            });
        } catch (e) {
            toast.error("Erro ao carregar dados.");
            onClose();
        } finally {
            setLoading(false);
        }
    };

    const autoSelectTurno = (dataInicioStr) => {
        const date = new Date(dataInicioStr);
        const minutes = date.getHours() * 60 + date.getMinutes();

        const turnoEncontrado = turnos.find(t => {
            const [h1, m1] = t.inicio.split(':').map(Number);
            const [h2, m2] = t.fim.split(':').map(Number);
            const start = h1 * 60 + m1;
            const end = h2 * 60 + m2;

            if (end < start) {
                return minutes >= start || minutes <= end;
            }
            return minutes >= start && minutes <= end;
        });

        if (turnoEncontrado) {
            setFormData(prev => ({ ...prev, turnoId: turnoEncontrado.id }));
        } else if (turnos.length > 0 && !formData.turnoId) {
            // Fallback: Se não casou horário, pega o primeiro da lista
            setFormData(prev => ({ ...prev, turnoId: turnos[0].id }));
        }
    };

    const handleNext = () => {
        if (activeStep === 0) {
            if (!formData.dataInicio || !formData.dataFim || !formData.tipo) {
                return toast.warning("Preencha Data Início, Fim e Tipo.");
            }
            if (new Date(formData.dataFim) <= new Date(formData.dataInicio)) {
                return toast.warning("Data Fim deve ser maior que Início.");
            }
        }
        setActiveStep((prev) => prev + 1);
    };

    const handleBack = () => setActiveStep((prev) => prev - 1);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload = { ...formData, docaId: null };

            if (isEdit) {
                await api.put(`/api/portaria/agenda/${agendamentoId}`, payload);
                toast.success("Agendamento atualizado!");
            } else {
                await api.post('/api/portaria/agenda', payload);
                toast.success("Agendamento criado com sucesso!");
            }
            onSuccess();
        } catch (error) {
            toast.error(error.response?.data?.message || "Erro ao salvar.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" fontWeight="bold">
                    {isEdit ? 'Editar Agendamento' : 'Novo Agendamento'}
                </Typography>
                <IconButton onClick={onClose} size="small"><X /></IconButton>
            </DialogTitle>

            <DialogContent dividers>
                <Stepper activeStep={activeStep} sx={{ mb: 4, mt: 1 }}>
                    {steps.map((label) => (
                        <Step key={label}><StepLabel>{label}</StepLabel></Step>
                    ))}
                </Stepper>

                <Box sx={{ minHeight: 300 }}>
                    {/* ETAPA 1: DADOS GERAIS */}
                    {activeStep === 0 && (
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <Alert severity="info" icon={<Calendar size={20} />} sx={{ mb: 1 }}>
                                    Defina a janela de tempo. O turno será ajustado automaticamente.
                                </Alert>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <FormControl fullWidth>
                                    <InputLabel>Tipo de Operação</InputLabel>
                                    <Select
                                        value={formData.tipo}
                                        label="Tipo de Operação"
                                        onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                                        sx={{ height: 56 }} // Força altura padrão do Material UI (igual TextField)
                                    >
                                        <MenuItem value="ENTRADA">Recebimento (Entrada)</MenuItem>
                                        <MenuItem value="SAIDA">Expedição (Saída)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Data/Hora Início"
                                    type="datetime-local"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.dataInicio}
                                    onChange={(e) => setFormData({ ...formData, dataInicio: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Data/Hora Fim"
                                    type="datetime-local"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.dataFim}
                                    onChange={(e) => setFormData({ ...formData, dataFim: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={12}> {/* Ocupa linha toda para não comprimir */}
                                <FormControl fullWidth>
                                    <InputLabel>Turno (Automático)</InputLabel>
                                    <Select
                                        value={formData.turnoId}
                                        label="Turno (Automático)"
                                        onChange={(e) => setFormData({ ...formData, turnoId: e.target.value })}
                                        sx={{ height: 56 }}
                                    >
                                        <MenuItem value=""><em>Manual / Nenhum</em></MenuItem>
                                        {turnos.map(t => (
                                            <MenuItem key={t.id} value={t.id}>{t.nome} ({t.inicio} - {t.fim})</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    )}

                    {/* ETAPA 2: VEÍCULO E TRANSPORTADORA */}
                    {activeStep === 1 && (
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <Alert severity="info" icon={<Truck size={20} />} sx={{ mb: 1 }}>
                                    Dados logísticos. A transportadora será pré-selecionada se disponível.
                                </Alert>
                            </Grid>

                            {/* TRANSPORTADORA: FULL WIDTH (12) para resolver o problema visual */}
                            <Grid item xs={12}>
                                <SearchableSelect
                                    label="Transportadora"
                                    options={transportadoras}
                                    value={formData.transportadoraId}
                                    onChange={(e) => setFormData({ ...formData, transportadoraId: e.target.value })}
                                    placeholder="Buscar transportadora..."
                                // A prop style ou sx pode ser passada se o componente suportar, 
                                // mas xs={12} já garante largura total do container
                                />
                            </Grid>

                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Placa do Veículo"
                                    fullWidth
                                    value={formData.placa}
                                    onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })}
                                    placeholder="AAA-0000"
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="Nome do Motorista"
                                    fullWidth
                                    value={formData.motoristaNome}
                                    onChange={(e) => setFormData({ ...formData, motoristaNome: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    label="CPF do Motorista"
                                    fullWidth
                                    value={formData.motoristaCpf}
                                    onChange={(e) => setFormData({ ...formData, motoristaCpf: e.target.value })}
                                />
                            </Grid>
                        </Grid>
                    )}
                </Box>
            </DialogContent>

            <DialogActions sx={{ p: 3, justifyContent: 'space-between' }}>
                <Button
                    disabled={activeStep === 0}
                    onClick={handleBack}
                    startIcon={<ArrowLeft />}
                >
                    Voltar
                </Button>

                {activeStep === steps.length - 1 ? (
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={loading}
                        startIcon={<Save />}
                        color="primary"
                    >
                        {loading ? 'Salvando...' : 'Finalizar Agendamento'}
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        onClick={handleNext}
                        endIcon={<ArrowRight />}
                    >
                        Próximo
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default AgendamentoForm;