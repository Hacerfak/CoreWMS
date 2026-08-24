import { useState, useEffect, useRef } from 'react';
import {
    Box, Button, Typography, Paper, Grid, TextField, InputAdornment, Card, CardContent,
    Divider, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Chip, Alert, MenuItem
} from '@mui/material';
import { Search, ArrowLeft, LogIn, LogOut, Truck, User, Clock, MapPin, RectangleHorizontal } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { getPatio, realizarCheckin, realizarCheckout } from '../../../services/portariaService';
import { getLocalizacoes } from '../../../services/localizacaoService';

const STATUS_CONFIG = {
    'NA_PORTARIA': { label: 'NO PÁTIO', color: 'warning' },
    'NA_DOCA': { label: 'NA DOCA', color: 'primary' },
    'FINALIZADO': { label: 'SAIU', color: 'success' }
};

const OperacaoPortaria = () => {
    const navigate = useNavigate();

    // REFS PARA NAVEGAÇÃO E FOCO
    const searchInputRef = useRef(null);
    const placaRef = useRef(null);
    const motoristaRef = useRef(null);
    const cpfRef = useRef(null);

    const [veiculosPatio, setVeiculosPatio] = useState([]);
    const [codigoBusca, setCodigoBusca] = useState('');

    const [checkinOpen, setCheckinOpen] = useState(false);
    const [checkinForm, setCheckinForm] = useState({ codigo: '', placa: '', motorista: '', cpf: '', docaId: '' });
    const [docasDisponiveis, setDocasDisponiveis] = useState([]);

    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [selectedReserva, setSelectedReserva] = useState(null);

    useEffect(() => {
        loadPatio();
        loadDocas();
        setTimeout(() => searchInputRef.current?.focus(), 500);
    }, []);

    // Mantém foco na busca se nenhum modal estiver aberto
    useEffect(() => {
        const interval = setInterval(() => {
            if (!checkinOpen && !checkoutOpen && document.activeElement !== searchInputRef.current) {
                // Verificação extra para não roubar foco se o usuário estiver interagindo com outra coisa
                if (!document.querySelector('.MuiDialog-root')) {
                    searchInputRef.current?.focus();
                }
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [checkinOpen, checkoutOpen]);

    const loadPatio = async () => {
        try {
            const data = await getPatio();
            setVeiculosPatio(data);
        } catch (e) { toast.error("Erro ao atualizar pátio."); }
    };

    const loadDocas = async () => {
        try {
            const data = await getLocalizacoes('DOCA');
            setDocasDisponiveis(data);
        } catch (e) { console.error("Erro ao carregar docas"); }
    };

    const handleSearchCheckin = () => {
        if (!codigoBusca) return;
        setCheckinForm({ codigo: codigoBusca, placa: '', motorista: '', cpf: '', docaId: '' });
        setCheckinOpen(true);
        // Foco na placa ao abrir o modal
        setTimeout(() => placaRef.current?.focus(), 100);
    };

    const confirmCheckin = async () => {
        if (!checkinForm.placa) return toast.warning("Placa é obrigatória.");

        try {
            await realizarCheckin(checkinForm.codigo, {
                placa: checkinForm.placa.toUpperCase(),
                motorista: checkinForm.motorista,
                cpf: checkinForm.cpf,
                docaId: checkinForm.docaId || ''
            });
            toast.success("Entrada registrada com sucesso!");
            setCheckinOpen(false);
            setCodigoBusca('');
            loadPatio();
            setTimeout(() => searchInputRef.current?.focus(), 100);
        } catch (e) {
            toast.error(e.response?.data?.message || "Erro no check-in.");
        }
    };

    const confirmCheckout = async () => {
        try {
            await realizarCheckout(selectedReserva.codigoReserva, null);
            toast.success("Saída registrada com sucesso!");
            setCheckoutOpen(false);
            loadPatio();
        } catch (e) {
            toast.error("Erro no check-out.");
        }
    };

    // --- LÓGICA DE NAVEGAÇÃO POR ENTER ---
    const handleEnter = (e, nextRef) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef.current?.focus();
        }
    };

    const handleLastEnter = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmCheckin();
        }
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/portaria')} color="inherit">Voltar</Button>
                    <Typography variant="h5" fontWeight="bold">Operação de Portaria</Typography>
                </Box>
            </Box>

            {/* ÁREA DE CHECK-IN RÁPIDO */}
            <Paper sx={{ p: 4, mb: 4, bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Typography variant="subtitle1" fontWeight="bold" mb={2}>Realizar Entrada (Check-in)</Typography>
                <Box display="flex" gap={2}>
                    <TextField
                        inputRef={searchInputRef}
                        fullWidth
                        autoFocus
                        placeholder="Bipe o QR Code ou digite o código da reserva..."
                        value={codigoBusca}
                        onChange={e => setCodigoBusca(e.target.value.toUpperCase())}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search size={24} color="#94a3b8" /></InputAdornment>,
                            style: { fontSize: '1.2rem', padding: '8px' }
                        }}
                        onKeyDown={e => e.key === 'Enter' && handleSearchCheckin()}
                    />
                    <Button
                        variant="contained" size="large" onClick={handleSearchCheckin}
                        startIcon={<LogIn size={24} />} sx={{ px: 4 }}
                    >
                        Registrar Entrada
                    </Button>
                </Box>
            </Paper>

            {/* LISTAGEM DO PÁTIO */}
            <Typography variant="h6" fontWeight="bold" mb={2} display="flex" alignItems="center" gap={1}>
                <Truck size={24} /> Veículos no Pátio ({veiculosPatio.length})
            </Typography>

            <Grid container spacing={2}>
                {veiculosPatio.map(v => {
                    const status = STATUS_CONFIG[v.status] || { label: v.status, color: 'default' };
                    return (
                        <Grid item xs={12} md={6} lg={4} key={v.id}>
                            <Card sx={{ borderLeft: '4px solid', borderColor: v.tipo === 'ENTRADA' ? 'success.main' : 'primary.main', height: '100%' }}>
                                <CardContent>
                                    <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1} gap={1}>
                                        <Box>
                                            <Typography variant="h5" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                                                {v.placaVeiculo || 'SEM PLACA'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" fontFamily="monospace">{v.codigoReserva}</Typography>
                                        </Box>
                                        <Chip label={status.label} size="small" color={status.color} variant="filled" sx={{ fontWeight: 'bold', fontSize: '0.7rem', height: 24 }} />
                                    </Box>
                                    <Divider sx={{ my: 2 }} />
                                    <Box display="flex" flexDirection="column" gap={1.5}>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <User size={18} color="#64748b" />
                                            <Typography variant="body1">{v.nomeMotoristaAvulso || v.motorista?.nome || 'Motorista não ident.'}</Typography>
                                        </Box>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <Clock size={18} color="#64748b" />
                                            <Typography variant="body2">Entrou às {new Date(v.dataChegada).toLocaleTimeString()}</Typography>
                                        </Box>
                                        {v.doca && (
                                            <Box display="flex" alignItems="center" gap={1} color="primary.main" bgcolor="#f0f9ff" p={0.5} borderRadius={1}>
                                                <MapPin size={18} />
                                                <Typography variant="body2" fontWeight="bold">
                                                    {/* AJUSTE AQUI: Descrição ou Endereço */}
                                                    Dirigir-se à: {v.doca.descricao || v.doca.enderecoCompleto}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>
                                    <Button fullWidth variant="outlined" color="error" sx={{ mt: 3 }} startIcon={<LogOut size={18} />} onClick={() => { setSelectedReserva(v); setCheckoutOpen(true); }}>
                                        Registrar Saída (Check-out)
                                    </Button>
                                </CardContent>
                            </Card>
                        </Grid>
                    );
                })}
                {veiculosPatio.length === 0 && (
                    <Grid item xs={12}><Alert severity="info">Nenhum veículo no pátio no momento.</Alert></Grid>
                )}
            </Grid>

            {/* Dialog Check-in */}
            <Dialog open={checkinOpen} onClose={() => setCheckinOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Confirmar Entrada</DialogTitle>
                <DialogContent>
                    <Box display="flex" flexDirection="column" gap={2} mt={1}>
                        <TextField label="Código Reserva" disabled value={checkinForm.codigo} fullWidth />

                        <TextField
                            select label="Atribuir Doca (Opcional)" fullWidth
                            value={checkinForm.docaId}
                            onChange={e => setCheckinForm({ ...checkinForm, docaId: e.target.value })}
                        >
                            <MenuItem value=""><em>Não definir agora</em></MenuItem>
                            {docasDisponiveis.map(d => (
                                <MenuItem key={d.id} value={d.id}>{d.descricao || d.enderecoCompleto} {d.status === 'OCUPADO' ? '(Ocupada)' : ''}</MenuItem>
                            ))}
                        </TextField>

                        <TextField
                            label="Placa do Veículo"
                            inputRef={placaRef}
                            value={checkinForm.placa}
                            onChange={e => setCheckinForm({ ...checkinForm, placa: e.target.value.toUpperCase() })}
                            onKeyDown={(e) => handleEnter(e, motoristaRef)}
                            fullWidth autoFocus
                            required
                            InputProps={{ startAdornment: <InputAdornment position="start"><RectangleHorizontal size={20} color="#94a3b8" /></InputAdornment> }}
                        />

                        <TextField
                            label="Nome do Motorista"
                            inputRef={motoristaRef}
                            value={checkinForm.motorista}
                            onChange={e => setCheckinForm({ ...checkinForm, motorista: e.target.value })}
                            onKeyDown={(e) => handleEnter(e, cpfRef)}
                            fullWidth
                        />

                        <TextField
                            label="CPF"
                            inputRef={cpfRef}
                            value={checkinForm.cpf}
                            onChange={e => setCheckinForm({ ...checkinForm, cpf: e.target.value })}
                            onKeyDown={handleLastEnter}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCheckinOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={confirmCheckin} size="large">Confirmar Entrada</Button>
                </DialogActions>
            </Dialog>

            {/* Dialog Check-out */}
            <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Saída de Veículo</DialogTitle>
                <DialogContent>
                    <Typography>Confirma a saída do veículo <b>{selectedReserva?.placaVeiculo}</b>?</Typography>
                    <Typography variant="body2" color="text.secondary" mt={1}>
                        Permanência: {selectedReserva ? ((new Date() - new Date(selectedReserva.dataChegada)) / 60000).toFixed(0) : 0} minutos.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setCheckoutOpen(false)}>Cancelar</Button>
                    <Button variant="contained" color="error" onClick={confirmCheckout} autoFocus>Confirmar Saída</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
export default OperacaoPortaria;