import { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, Paper, Typography, Grid, Card, CardContent,
    TextField, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, MenuItem, IconButton, Tooltip, Divider, Avatar
} from '@mui/material';
import {
    Calendar, ArrowLeft, Plus, Upload, Truck, Eye,
    MapPin, Clock, LogOut, LogIn, User, Share2, Printer,
    XCircle, Trash2, CheckCircle, RectangleHorizontal, Copy, FileText, ClipboardList,
    Warehouse,
    UserX2,
    UserRoundX
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import QRCode from 'react-qr-code';

import { getAgenda, vincularXmlAgendamento, cancelarAgendamento, marcarNoShow, excluirAgendamento } from '../../../services/portariaService';
import { getParceiros } from '../../../services/parceiroService';
import AgendamentoForm from './AgendamentoForm';
import SearchableSelect from '../../../components/SearchableSelect';
import ConfirmDialog from '../../../components/ConfirmDialog';

// Configuração Visual dos Status
const STATUS_MAP = {
    'AGENDADO': { label: 'AGENDADO', color: 'default', icon: <Calendar size={16} /> },
    'NA_PORTARIA': { label: 'NO PÁTIO', color: 'warning', icon: <Truck size={16} /> },
    'NA_DOCA': { label: 'NA DOCA', color: 'primary', icon: <MapPin size={16} /> },
    'AGUARDANDO_SAIDA': { label: 'SAÍDA PENDENTE', color: 'info', icon: <LogOut size={16} /> },
    'FINALIZADO': { label: 'FINALIZADO', color: 'success', icon: <CheckCircle size={16} /> },
    'CANCELADO': { label: 'CANCELADO', color: 'error', icon: <XCircle size={16} /> },
    'NO_SHOW': { label: 'NÃO COMPARECEU', color: 'warning', icon: <UserRoundX size={16} /> }
};

const AgendamentoList = () => {
    const navigate = useNavigate();
    const [agenda, setAgenda] = useState([]);

    // Filtros
    const [filtros, setFiltros] = useState({
        data: dayjs().format('YYYY-MM-DD'),
        tipo: 'TODOS',
        parceiroId: '' // Vazio = Todos
    });

    // CORREÇÃO: Inicializa já com a opção "Todos" para renderizar corretamente antes da API responder
    const [listaParceiros, setListaParceiros] = useState([
        { value: '', label: 'Todos os Parceiros' }
    ]);

    // Modais
    const [modalOpen, setModalOpen] = useState(false);
    const [xmlModalOpen, setXmlModalOpen] = useState(false);
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [detalhesOpen, setDetalhesOpen] = useState(false);

    // Dialog Confirmação
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({ title: '', message: '', action: null });

    const [selectedItem, setSelectedItem] = useState(null);
    const [file, setFile] = useState(null);

    // Carga Inicial
    useEffect(() => {
        loadParceiros();
    }, []);

    // Recarrega agenda sempre que a DATA muda (Filtro de API)
    useEffect(() => {
        loadAgenda();
    }, [filtros.data]);

    const loadParceiros = async () => {
        try {
            const data = await getParceiros();
            // Mantém "Todos" no topo e adiciona os da API
            const options = [
                { value: '', label: 'Todos os Parceiros' },
                ...data.map(p => ({ value: p.id, label: p.nome }))
            ];
            setListaParceiros(options);
        } catch (e) { console.error("Erro ao carregar parceiros", e); }
    };

    const loadAgenda = async () => {
        try {
            const data = await getAgenda(filtros.data);
            setAgenda(data);
        } catch (e) { toast.error("Erro ao carregar agenda."); }
    };

    // Filtragem Local (Tipo e Parceiro) - Instantânea
    const agendaFiltrada = useMemo(() => {
        return agenda.filter(item => {
            // Filtro de Tipo
            if (filtros.tipo !== 'TODOS' && item.tipo !== filtros.tipo) return false;

            // Filtro de Parceiro (Verifica Transportadora, Cliente ou Fornecedor)
            if (filtros.parceiroId) {
                const pid = String(filtros.parceiroId);
                const isTransp = String(item.transportadora?.id) === pid;
                const isCliente = String(item.solicitacaoSaida?.cliente?.id) === pid;
                const isForn = String(item.solicitacaoEntrada?.fornecedor?.id) === pid;

                if (!isTransp && !isCliente && !isForn) return false;
            }
            return true;
        });
    }, [agenda, filtros.tipo, filtros.parceiroId]);

    // --- AÇÕES ---

    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        toast.info("Código copiado!");
    };

    const handleUploadXml = async () => {
        if (!file || !selectedItem) return;
        try {
            await vincularXmlAgendamento(selectedItem.id, file);
            toast.success("XML Vinculado com Sucesso!");
            setXmlModalOpen(false);
            setFile(null);
            loadAgenda();
        } catch (e) { toast.error("Erro no upload do XML."); }
    };

    const handleAction = (type, item) => {
        let apiFunc;
        let msg = "";
        let title = "";

        if (type === 'CANCELAR') {
            title = "Cancelar Agendamento";
            msg = `Deseja cancelar o agendamento ${item.codigoReserva}? \nIsso também cancelará a solicitação vinculada.`;
            apiFunc = () => cancelarAgendamento(item.id);
        }
        else if (type === 'NO_SHOW') {
            title = "Registrar No Show";
            msg = "Confirmar que o veículo NÃO compareceu?";
            apiFunc = () => marcarNoShow(item.id);
        }
        else if (type === 'EXCLUIR') {
            title = "Excluir Definitivamente";
            msg = "Atenção: Isso removerá o registro e a solicitação do histórico. Continuar?";
            apiFunc = () => excluirAgendamento(item.id);
        }

        setConfirmData({
            title, message: msg,
            action: async () => {
                try { await apiFunc(); toast.success("Operação realizada!"); loadAgenda(); }
                catch (e) { toast.error(e.response?.data?.message || "Erro na operação."); }
            }
        });
        setConfirmOpen(true);
    };

    const handlePrintQr = () => {
        const printWindow = window.open('', '', 'width=600,height=600');
        printWindow.document.write('<html><body style="text-align:center; padding: 20px;">');
        printWindow.document.write(document.getElementById('qr-code-container').innerHTML);
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    };

    // Helper Visual para Doca
    const getDocaLabel = (doca) => {
        if (!doca) return "Sem Doca";
        // Prioridade: Descrição > Endereço Completo > Código
        return doca.descricao || doca.enderecoCompleto || doca.codigo;
    };

    return (
        <Box>
            {/* CABEÇALHO */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/portaria')} color="inherit">Voltar</Button>
                    <Typography variant="h5" fontWeight="bold">Agenda de Pátio</Typography>
                </Box>
                <Button variant="contained" startIcon={<Plus />} onClick={() => setModalOpen(true)} size="large">
                    Novo Agendamento
                </Button>
            </Box>

            {/* FILTROS */}
            <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            label="Data" type="date" fullWidth size="small"
                            InputLabelProps={{ shrink: true }}
                            value={filtros.data}
                            onChange={e => setFiltros({ ...filtros, data: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <TextField
                            select label="Tipo de Operação" fullWidth size="small"
                            value={filtros.tipo}
                            onChange={e => setFiltros({ ...filtros, tipo: e.target.value })}
                        >
                            <MenuItem value="TODOS">Todos</MenuItem>
                            <MenuItem value="ENTRADA">Recebimento (Entrada)</MenuItem>
                            <MenuItem value="SAIDA">Expedição (Saída)</MenuItem>
                        </TextField>
                    </Grid>
                    {/* Largura ajustada para ocupar mais espaço no nome do parceiro */}
                    <Grid item xs={12} md={6}>
                        <SearchableSelect
                            label="Filtrar por Parceiro / Transportadora"
                            options={listaParceiros}
                            value={filtros.parceiroId}
                            onChange={e => setFiltros({ ...filtros, parceiroId: e.target.value })}
                        />
                    </Grid>
                </Grid>
            </Paper>

            {/* LISTAGEM DE CARDS */}
            <Grid container spacing={2}>
                {agendaFiltrada.length === 0 && (
                    <Grid item xs={12}>
                        <Paper sx={{ p: 6, textAlign: 'center', bgcolor: '#f8fafc', border: '1px dashed #e2e8f0', borderRadius: 3 }}>
                            <Calendar size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
                            <Typography color="text.secondary" variant="h6">Nenhum agendamento encontrado para esta data.</Typography>
                        </Paper>
                    </Grid>
                )}

                {agendaFiltrada.map(item => {
                    const isEntry = item.tipo === 'ENTRADA';
                    const parceiro = isEntry
                        ? item.solicitacaoEntrada?.fornecedor?.nome
                        : item.solicitacaoSaida?.cliente?.nome;
                    const nomeExibicao = parceiro || item.transportadora?.nome || 'Transportadora Própria';

                    const statusInfo = STATUS_MAP[item.status] || STATUS_MAP.AGENDADO;
                    const corTipo = isEntry ? 'success' : 'primary';

                    // Info extra (NF ou Pedido)
                    const docNum = isEntry
                        ? item.solicitacaoEntrada?.notaFiscal
                        : item.solicitacaoSaida?.codigoExterno;
                    const docLabel = isEntry ? "NF" : "Ped";
                    const DocIcon = isEntry ? FileText : ClipboardList;

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
                                    '&:hover': { boxShadow: '0 8px 16px rgba(0,0,0,0.06)', transform: 'translateY(-2px)' }
                                }}
                            >
                                <Grid container alignItems="center" spacing={0}>

                                    {/* COLUNA 1: HORÁRIO (Esquerda) */}
                                    <Grid item xs={12} sm={2} md={2}
                                        sx={{
                                            borderRight: { sm: '1px solid #f1f5f9' },
                                            pr: { sm: 2 },
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <Box display="flex" alignItems="center" gap={0.5} mb={0.5}>
                                            <Clock size={16} color="#94a3b8" />
                                            <Typography variant="caption" color="text.secondary" fontWeight="600">CHEGADA</Typography>
                                        </Box>

                                        <Typography variant="h4" fontWeight="800" color="text.primary" sx={{ letterSpacing: -1 }}>
                                            {dayjs(item.dataPrevistaInicio).format('HH:mm')}
                                        </Typography>

                                        <Tooltip title="Clique para copiar código">
                                            <Chip
                                                icon={<Copy size={12} />}
                                                label={item.codigoReserva}
                                                size="small"
                                                variant="outlined"
                                                onClick={() => handleCopyCode(item.codigoReserva)}
                                                sx={{
                                                    mt: 1,
                                                    fontFamily: 'monospace',
                                                    cursor: 'pointer',
                                                    bgcolor: '#f8fafc',
                                                    fontWeight: '600',
                                                    fontSize: '0.75rem',
                                                    '&:hover': { bgcolor: '#f1f5f9' }
                                                }}
                                            />
                                        </Tooltip>
                                    </Grid>

                                    {/* COLUNA 2: DADOS LOGÍSTICOS (Centro) */}
                                    <Grid item xs={12} sm={7} md={6}
                                        sx={{
                                            px: { sm: 3 },
                                            borderRight: { sm: '1px solid #f1f5f9' },
                                            display: 'flex', flexDirection: 'column',
                                            alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >
                                        <Box mb={1.5} textAlign="center">
                                            <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={0.5}>
                                                <Truck size={16} color="#94a3b8" />
                                                <Typography variant="caption" color="text.secondary" fontWeight="600">
                                                    PARCEIRO / TRANSPORTE
                                                </Typography>
                                            </Box>
                                            <Typography variant="subtitle1" fontWeight="bold" noWrap title={nomeExibicao} align="center" sx={{ maxWidth: '100%' }}>
                                                {nomeExibicao}
                                            </Typography>
                                        </Box>

                                        <Box display="flex" gap={2} justifyContent="center" flexWrap="wrap">
                                            {/* Tipo Operação */}
                                            <Chip
                                                label={item.tipo}
                                                color={corTipo}
                                                size="small"
                                                icon={isEntry ? <LogIn size={12} /> : <LogOut size={12} />}
                                                sx={{ fontWeight: '800', px: 1, fontSize: '0.7rem' }}
                                            />

                                            {/* Veículo */}
                                            {item.placaVeiculo ? (
                                                <Box display="flex" alignItems="center" gap={0.5} title="Placa do Veículo">
                                                    <RectangleHorizontal size={16} color="#64748b" />
                                                    <Typography variant="body2" fontWeight="bold">{item.placaVeiculo}</Typography>
                                                </Box>
                                            ) : (
                                                <Box display="flex" alignItems="center" gap={0.5} color="text.secondary">
                                                    <RectangleHorizontal size={16} />
                                                    <Typography variant="caption">--</Typography>
                                                </Box>
                                            )}

                                            {/* Doca */}
                                            {item.doca ? (
                                                <Box display="flex" alignItems="center" gap={0.5} title="Doca Destino">
                                                    <Warehouse size={16} color="#2563eb" />
                                                    <Typography variant="body2" fontWeight="bold" color="primary">
                                                        {getDocaLabel(item.doca)}
                                                    </Typography>
                                                </Box>
                                            ) : (
                                                <Box display="flex" alignItems="center" gap={0.5} color="text.secondary">
                                                    <MapPin size={16} />
                                                    <Typography variant="caption">Sem Doca</Typography>
                                                </Box>
                                            )}

                                            {/* NF/Pedido extra se houver */}
                                            {docNum && (
                                                <Chip
                                                    icon={<DocIcon size={12} />}
                                                    label={`${docLabel}: ${docNum}`}
                                                    variant="outlined"
                                                    size="small"
                                                    sx={{ fontSize: '0.7rem', height: 24 }}
                                                />
                                            )}
                                        </Box>
                                    </Grid>

                                    {/* COLUNA 3: STATUS E AÇÕES (Direita) */}
                                    <Grid item xs={12} sm={3} md={4}
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
                                            sx={{ fontWeight: 'bold', mb: 1.5 }}
                                        />

                                        <Box display="flex" gap={1} flexWrap="wrap" justifyContent="center">
                                            {/* Ações disponíveis apenas se o agendamento estiver 'vivo' */}
                                            {['AGENDADO', 'NA_PORTARIA'].includes(item.status) && (
                                                <>
                                                    {isEntry && !item.xmlVinculado && (
                                                        <Tooltip title="Vincular XML da Nota">
                                                            <IconButton size="small" sx={{ color: '#f61b88ff', border: '1px solid #fce7f3', bgcolor: '#fff1f2' }} onClick={() => { setSelectedItem(item); setXmlModalOpen(true); }}>
                                                                <Upload size={16} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}

                                                    <Tooltip title="QR Code de Acesso">
                                                        <IconButton size="small" color="primary" sx={{ border: '1px solid #e0f2fe', bgcolor: '#f0f9ff' }} onClick={() => { setSelectedItem(item); setQrModalOpen(true); }}>
                                                            <Share2 size={16} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )}

                                            {item.status === 'AGENDADO' && (
                                                <Tooltip title="Não compareceu">
                                                    <IconButton size="small" color="warning" sx={{ border: '1px solid #fee2e2', bgcolor: '#fef2f2' }} onClick={() => handleAction('NO_SHOW', item)}>
                                                        <UserX2 size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {/* Detalhes sempre visível */}
                                            <Tooltip title="Ver Detalhes">
                                                <IconButton size="small" onClick={() => { setSelectedItem(item); setDetalhesOpen(true); }} sx={{ border: '1px solid #e2e8f0' }}>
                                                    <Eye size={16} />
                                                </IconButton>
                                            </Tooltip>

                                            {/* Cancelar se ainda agendado ou não compareceu */}
                                            {['AGENDADO', 'NO_SHOW'].includes(item.status) && (
                                                <Tooltip title="Cancelar Agendamento">
                                                    <IconButton size="small" color="error" sx={{ border: '1px solid #fee2e2', bgcolor: '#fef2f2' }} onClick={() => handleAction('CANCELAR', item)}>
                                                        <XCircle size={16} />
                                                    </IconButton>
                                                </Tooltip>
                                            )}

                                            {/* Excluir se Cancelado */}
                                            {item.status === 'CANCELADO' && (
                                                <Tooltip title="Excluir Definitivamente">
                                                    <IconButton size="small" color="error" onClick={() => handleAction('EXCLUIR', item)}>
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

            {/* MODAIS (Lógica Original Preservada) */}

            <AgendamentoForm
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={() => { setModalOpen(false); loadAgenda(); }}
                dataInicial={{ data: filtros.data }}
            />

            {/* Modal XML */}
            <Dialog open={xmlModalOpen} onClose={() => setXmlModalOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Vincular Nota Fiscal</DialogTitle>
                <DialogContent>
                    <Box component="label" sx={{ mt: 1, p: 5, border: '2px dashed #cbd5e1', borderRadius: 3, bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: '0.2s', '&:hover': { borderColor: 'primary.main', bgcolor: '#f1f5f9' } }}>
                        <input type="file" hidden accept=".xml" onChange={e => setFile(e.target.files[0])} />
                        <Box p={2} bgcolor="white" borderRadius="50%" boxShadow={2} mb={2}><Upload size={32} color="#2563eb" /></Box>
                        <Typography variant="h6" color="text.primary">Clique para selecionar o XML</Typography>
                        <Typography variant="body2" color="text.secondary">O sistema preencherá os dados automaticamente.</Typography>
                        {file && <Chip label={file.name} color="primary" onDelete={(e) => { e.preventDefault(); setFile(null); }} sx={{ mt: 2 }} />}
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setXmlModalOpen(false)}>Cancelar</Button>
                    <Button variant="contained" onClick={handleUploadXml} disabled={!file}>Confirmar</Button>
                </DialogActions>
            </Dialog>

            {/* Modal QR Code */}
            <Dialog open={qrModalOpen} onClose={() => setQrModalOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Compartilhar Agendamento</DialogTitle>
                <DialogContent>
                    <Box id="qr-code-container" textAlign="center" py={2}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>{selectedItem?.transportadora?.nome}</Typography>
                        <Typography variant="body2" color="text.secondary" mb={3}>Apresente este código na portaria.</Typography>
                        <div style={{ background: 'white', padding: '16px', display: 'inline-block', border: '1px solid #eee', borderRadius: 8 }}>
                            {selectedItem && <QRCode value={selectedItem.codigoReserva} size={200} />}
                        </div>
                        <Typography variant="h5" fontWeight="bold" mt={2} letterSpacing={2}>{selectedItem?.codigoReserva}</Typography>
                        <Typography variant="caption" display="block">{dayjs(selectedItem?.dataPrevistaInicio).format('DD/MM/YYYY HH:mm')}</Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ justifyContent: 'center', pb: 3 }}>
                    <Button startIcon={<Printer />} variant="outlined" onClick={handlePrintQr}>Imprimir</Button>
                    <Button onClick={() => setQrModalOpen(false)}>Fechar</Button>
                </DialogActions>
            </Dialog>

            {/* Modal Detalhes Simples */}
            <Dialog open={detalhesOpen} onClose={() => setDetalhesOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Detalhes do Agendamento</DialogTitle>
                <DialogContent dividers>
                    {selectedItem && (
                        <Grid container spacing={2}>
                            <Grid item xs={6}><Typography variant="caption">Código</Typography><Typography variant="body1" fontWeight="bold">{selectedItem.codigoReserva}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption">Status</Typography><br /><Chip label={STATUS_MAP[selectedItem.status]?.label} color={STATUS_MAP[selectedItem.status]?.color} size="small" /></Grid>
                            <Grid item xs={12}><Divider /></Grid>
                            <Grid item xs={6}><Typography variant="caption">Início Previsto</Typography><Typography>{dayjs(selectedItem.dataPrevistaInicio).format('DD/MM/YYYY HH:mm')}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption">Fim Previsto</Typography><Typography>{dayjs(selectedItem.dataPrevistaFim).format('DD/MM/YYYY HH:mm')}</Typography></Grid>
                            <Grid item xs={12}><Typography variant="caption">Transportadora</Typography><Typography fontWeight="bold">{selectedItem.transportadora?.nome || '-'}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption">Placa</Typography><Typography>{selectedItem.placaVeiculo || '-'}</Typography></Grid>
                            <Grid item xs={6}><Typography variant="caption">Motorista</Typography><Typography>{selectedItem.nomeMotoristaAvulso || selectedItem.motorista?.nome || '-'}</Typography></Grid>

                            {/* Detalhes de Entrada (NFe) */}
                            {selectedItem.tipo === 'ENTRADA' && (
                                <Grid item xs={12}>
                                    <Box bgcolor="#f0fdf4" p={2} borderRadius={2} mt={1} border="1px solid #bbf7d0">
                                        <Typography variant="caption" color="success.main" fontWeight="bold" display="block" mb={1}>DADOS DA ENTRADA (NFe)</Typography>
                                        <Typography variant="body2"><b>Fornecedor:</b> {selectedItem.solicitacaoEntrada?.fornecedor?.nome || 'Aguardando XML'}</Typography>
                                        <Typography variant="body2"><b>Nota Fiscal:</b> {selectedItem.solicitacaoEntrada?.notaFiscal || '-'}</Typography>
                                    </Box>
                                </Grid>
                            )}

                            {/* Detalhes de Saída */}
                            {selectedItem.tipo === 'SAIDA' && (
                                <Grid item xs={12}>
                                    <Box bgcolor="#eff6ff" p={2} borderRadius={2} mt={1} border="1px solid #bfdbfe">
                                        <Typography variant="caption" color="primary.main" fontWeight="bold" display="block" mb={1}>DADOS DA SAÍDA</Typography>
                                        <Typography variant="body2"><b>Cliente:</b> {selectedItem.solicitacaoSaida?.cliente?.nome}</Typography>
                                        <Typography variant="body2"><b>Pedido:</b> {selectedItem.solicitacaoSaida?.codigoExterno}</Typography>
                                    </Box>
                                </Grid>
                            )}
                        </Grid>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={() => setDetalhesOpen(false)}>Fechar</Button></DialogActions>
            </Dialog>

            <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={confirmData.action} title={confirmData.title} message={confirmData.message} severity={confirmData.title.includes("Excluir") ? "error" : "primary"} />
        </Box>
    );
};

export default AgendamentoList;