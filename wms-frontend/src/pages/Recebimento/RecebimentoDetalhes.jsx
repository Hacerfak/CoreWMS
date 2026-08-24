import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Grid, Card, CardContent, Chip, Divider,
    LinearProgress, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, IconButton, Tooltip, Alert
} from '@mui/material';
import {
    ArrowLeft, FileText, Truck, Calendar, MapPin, Package,
    CheckCircle2, AlertTriangle, Copy, Layers, ShieldAlert, Ban
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getRecebimentoById, getLpnsDaSolicitacao } from '../../services/recebimentoService';

const RecebimentoDetalhes = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [recebimento, setRecebimento] = useState(null);
    const [lpns, setLpns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabIndex, setTabIndex] = useState(0);

    useEffect(() => {
        loadData();
    }, [id]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [recData, lpnsData] = await Promise.all([
                getRecebimentoById(id),
                getLpnsDaSolicitacao(id)
            ]);
            setRecebimento(recData);
            setLpns(lpnsData);
        } catch (error) {
            toast.error("Erro ao carregar detalhes.");
            navigate('/recebimento/lista');
        } finally {
            setLoading(false);
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'CRIADA': return 'default';
            case 'AGUARDANDO_EXECUCAO': return 'info'; // Novo: Azul claro    // Novo: Azul forte
            case 'EM_PROCESSAMENTO': return 'primary';    // Mantido por compatibilidade
            case 'DIVERGENTE': return 'warning';          // Novo: Laranja
            case 'BLOQUEDA': return 'error';              // Vermelho
            case 'CONCLUIDA': return 'success';           // Verde
            case 'CANCELADA': return 'error';             // Vermelho
            default: return 'default';
        }
    };

    const handleCopyKey = (key) => {
        navigator.clipboard.writeText(key);
        toast.success("Chave copiada!");
    };

    // Cálculos de Totais
    const totalPrevisto = recebimento?.itens?.reduce((acc, i) => acc + i.quantidadePrevista, 0) || 0;
    const totalConferido = recebimento?.itens?.reduce((acc, i) => acc + (i.quantidadeConferida || 0), 0) || 0;
    const percentual = totalPrevisto > 0 ? (totalConferido / totalPrevisto) * 100 : 0;

    // Filtra LPNs com problemas (Qualidade != DISPONIVEL)
    // Assumindo que LpnItem tem statusQualidade
    const lpnsBloqueadas = lpns.filter(l =>
        l.itens.some(i => i.statusQualidade && i.statusQualidade !== 'DISPONIVEL')
    );

    if (loading) return <LinearProgress />;
    if (!recebimento) return <Alert severity="error">Recebimento não encontrado.</Alert>;

    return (
        <Box pb={4}>
            {/* --- CABEÇALHO --- */}
            <Box display="flex" alignItems="center" gap={2} mb={3}>
                <Button startIcon={<ArrowLeft />} onClick={() => navigate('/recebimento/lista')} color="inherit">
                    Voltar
                </Button>
                <Box>
                    <Typography variant="h5" fontWeight="bold">Detalhes da Entrada</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Acompanhamento da Solicitação #{recebimento.id}
                    </Typography>
                </Box>
                <Box flex={1} textAlign="right">
                    <Chip
                        label={recebimento.status?.replace(/_/g, ' ')}
                        color={getStatusColor(recebimento.status)} // <--- Use a função aqui
                        sx={{ fontWeight: 'bold' }}
                    />
                </Box>
            </Box>

            {/* --- INFO CARDS --- */}
            <Grid container spacing={3} mb={4}>
                {/* Card 1: Nota Fiscal e Fornecedor */}
                <Grid item xs={12} md={5}>
                    <Card elevation={0} sx={{ border: '1px solid #e2e8f0', height: '100%' }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1} mb={2}>
                                <FileText className="text-blue-600" size={20} />
                                <Typography variant="subtitle1" fontWeight="bold">Dados da Nota</Typography>
                            </Box>

                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Número NF</Typography>
                                    <Typography fontWeight="bold">{recebimento.notaFiscal}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Emissão</Typography>
                                    <Typography fontWeight="bold">
                                        {recebimento.dataEmissao ? new Date(recebimento.dataEmissao).toLocaleDateString() : '-'}
                                    </Typography>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="caption" color="text.secondary">Fornecedor</Typography>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        <Truck size={16} color="#64748b" />
                                        <Typography fontWeight="500">{recebimento.fornecedor?.nome}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="caption" color="text.secondary">Chave de Acesso</Typography>
                                    <Box display="flex" alignItems="center" gap={1} bgcolor="#f8fafc" p={1} borderRadius={1} border="1px dashed #cbd5e1">
                                        <Typography variant="caption" fontFamily="monospace" sx={{ wordBreak: 'break-all' }}>
                                            {recebimento.chaveAcesso || 'N/A'}
                                        </Typography>
                                        {recebimento.chaveAcesso && (
                                            <Tooltip title="Copiar"><IconButton size="small" onClick={() => handleCopyKey(recebimento.chaveAcesso)}><Copy size={14} /></IconButton></Tooltip>
                                        )}
                                    </Box>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Card 2: Logística e Status */}
                <Grid item xs={12} md={4}>
                    <Card elevation={0} sx={{ border: '1px solid #e2e8f0', height: '100%' }}>
                        <CardContent>
                            <Box display="flex" alignItems="center" gap={1} mb={2}>
                                <MapPin className="text-orange-600" size={20} />
                                <Typography variant="subtitle1" fontWeight="bold">Logística</Typography>
                            </Box>

                            <Box mb={2}>
                                <Typography variant="caption" color="text.secondary">Doca Atribuída</Typography>
                                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                                    {recebimento.doca ? (
                                        <>
                                            <MapPin size={18} color="#16a34a" />
                                            <Typography fontWeight="bold" color="success.main">{recebimento.doca.enderecoCompleto}</Typography>
                                        </>
                                    ) : (
                                        <Chip label="Não atribuída" size="small" color="error" variant="outlined" icon={<AlertTriangle size={14} />} />
                                    )}
                                </Box>
                            </Box>

                            <Box mb={2}>
                                <Typography variant="caption" color="text.secondary">Data de Entrada (Sistema)</Typography>
                                <Box display="flex" alignItems="center" gap={1}>
                                    <Calendar size={16} color="#64748b" />
                                    <Typography>{new Date(recebimento.dataCriacao).toLocaleString()}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Card 3: Métricas */}
                <Grid item xs={12} md={3}>
                    <Card elevation={0} sx={{ border: '1px solid #e2e8f0', height: '100%', bgcolor: '#f8fafc' }}>
                        <CardContent>
                            <Typography variant="subtitle2" color="text.secondary" gutterBottom>Progresso da Conferência</Typography>
                            <Box display="flex" alignItems="baseline" gap={1} mb={1}>
                                <Typography variant="h4" fontWeight="bold" color="primary.main">{Math.round(percentual)}%</Typography>
                                <Typography variant="caption" color="text.secondary">concluído</Typography>
                            </Box>
                            <LinearProgress variant="determinate" value={Math.min(percentual, 100)} sx={{ height: 8, borderRadius: 4, mb: 3 }} />

                            <Divider sx={{ my: 2 }} />

                            <Box display="flex" justifyContent="space-between" mb={1}>
                                <Typography variant="body2">Volumes (LPNs)</Typography>
                                <Typography fontWeight="bold">{lpns.length}</Typography>
                            </Box>
                            <Box display="flex" justifyContent="space-between">
                                <Typography variant="body2">Itens Bloqueados</Typography>
                                <Typography fontWeight="bold" color={lpnsBloqueadas.length > 0 ? "error.main" : "text.primary"}>
                                    {lpnsBloqueadas.length}
                                </Typography>
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* --- TABS --- */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
                <Tabs
                    value={tabIndex}
                    onChange={(e, v) => setTabIndex(v)}
                    sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}
                >
                    <Tab label="Itens da Nota" icon={<Package size={18} />} iconPosition="start" />
                    <Tab label={`LPNs Gerados (${lpns.length})`} icon={<Layers size={18} />} iconPosition="start" />
                    {lpnsBloqueadas.length > 0 && (
                        <Tab label="Quarentena / Bloqueios" icon={<ShieldAlert size={18} />} iconPosition="start" sx={{ color: 'error.main' }} />
                    )}
                </Tabs>

                {/* TAB 0: ITENS DA NOTA */}
                {tabIndex === 0 && (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>SKU</TableCell>
                                    <TableCell>Produto</TableCell>
                                    <TableCell align="right">Qtd. Nota</TableCell>
                                    <TableCell align="right">Qtd. Conferida</TableCell>
                                    <TableCell align="center">Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {recebimento.itens.map((item) => {
                                    const conf = item.quantidadeConferida || 0;
                                    const prev = item.quantidadePrevista || 0;
                                    const completo = conf >= prev;

                                    return (
                                        <TableRow key={item.id} hover>
                                            <TableCell sx={{ fontWeight: 'bold' }}>{item.produto.sku}</TableCell>
                                            <TableCell>{item.produto.nome}</TableCell>
                                            <TableCell align="right">{prev}</TableCell>
                                            <TableCell align="right">
                                                <Typography color={completo ? 'success.main' : 'primary.main'} fontWeight="bold">
                                                    {conf}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                {completo
                                                    ? <CheckCircle2 size={18} color="#16a34a" />
                                                    : <Chip label="Pendente" size="small" variant="outlined" />
                                                }
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {/* TAB 1: LPNs */}
                {tabIndex === 1 && (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>LPN (Código)</TableCell>
                                    <TableCell>Local Atual</TableCell>
                                    <TableCell>Conteúdo</TableCell>
                                    <TableCell>Lote / Validade</TableCell>
                                    <TableCell align="center">Situação</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {lpns.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} align="center">Nenhuma LPN gerada ainda.</TableCell></TableRow>
                                ) : (
                                    lpns.map((lpn) => (
                                        <TableRow key={lpn.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{lpn.codigo}</TableCell>
                                            <TableCell>
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <MapPin size={14} color="#64748b" />
                                                    {lpn.localizacaoAtual?.enderecoCompleto || 'Em Trânsito'}
                                                </Box>
                                            </TableCell>
                                            <TableCell>
                                                {lpn.itens?.map((i, idx) => (
                                                    <Box key={idx}>
                                                        <Typography variant="body2">
                                                            {i.produto?.sku} - {i.produto?.nome}
                                                            <strong> ({i.quantidade} un)</strong>
                                                        </Typography>
                                                    </Box>
                                                ))}
                                            </TableCell>
                                            <TableCell>
                                                {lpn.itens?.map((i, idx) => (
                                                    <Box key={idx} sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                                                        {i.lote && <div>L: {i.lote}</div>}
                                                        {i.dataValidade && <div>V: {new Date(i.dataValidade).toLocaleDateString()}</div>}
                                                        {!i.lote && !i.dataValidade && '-'}
                                                    </Box>
                                                ))}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={lpn.status}
                                                    size="small"
                                                    color={lpn.status === 'ARMAZENADO' ? 'success' : 'default'}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}

                {/* TAB 2: QUARENTENA / BLOQUEIOS */}
                {tabIndex === 2 && (
                    <Box>
                        <Alert severity="warning" sx={{ m: 2 }}>
                            Estes volumes contêm itens com status de qualidade bloqueado ou avariado.
                        </Alert>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>LPN</TableCell>
                                        <TableCell>Produto</TableCell>
                                        <TableCell>Motivo/Status</TableCell>
                                        <TableCell align="center">Ação</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {lpnsBloqueadas.map((lpn) => (
                                        <TableRow key={lpn.id}>
                                            <TableCell fontWeight="bold">{lpn.codigo}</TableCell>
                                            <TableCell>
                                                {lpn.itens.map(i => (
                                                    <div key={i.id}>{i.produto.sku}</div>
                                                ))}
                                            </TableCell>
                                            <TableCell>
                                                {lpn.itens.map(i => (
                                                    <Chip
                                                        key={i.id}
                                                        label={i.statusQualidade || 'BLOQUEADO'}
                                                        color="error"
                                                        size="small"
                                                        icon={<Ban size={14} />}
                                                    />
                                                ))}
                                            </TableCell>
                                            <TableCell align="center">
                                                <Button size="small" variant="outlined" color="primary">Inspecionar</Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Box>
                )}
            </Paper>
        </Box>
    );
};

export default RecebimentoDetalhes;