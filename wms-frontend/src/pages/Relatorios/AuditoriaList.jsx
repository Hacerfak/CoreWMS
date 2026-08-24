import { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, IconButton, Tooltip, TextField, Button,
    Grid, MenuItem, Pagination, Dialog, DialogTitle, DialogContent, DialogActions,
    Divider, Alert
} from '@mui/material';
import { Search, Eye, RefreshCw, History as HistoryIcon, ArrowRight, FileJson } from 'lucide-react';
import { toast } from 'react-toastify';
import { getAuditLogs } from '../../services/auditService';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Configura Plugins de Data
dayjs.extend(utc);
dayjs.extend(timezone);

const AuditoriaList = () => {
    // --- ESTADOS ---
    const [filtros, setFiltros] = useState({
        inicio: dayjs().subtract(24, 'hour').format('YYYY-MM-DDTHH:mm'),
        fim: dayjs().format('YYYY-MM-DDTHH:mm'),
        usuario: '',
        entidade: '',
        acao: 'TODAS'
    });

    const [logs, setLogs] = useState([]);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(false);

    const [selectedLog, setSelectedLog] = useState(null);
    const [parsedData, setParsedData] = useState(null);

    // --- CARGA DE DADOS (CALLBACK) ---
    // Esta função recebe a página explicitamente para evitar erros de estado antigo
    const fetchLogs = useCallback(async (pageIndex) => {
        setLoading(true);
        try {
            const filtrosApi = {
                ...filtros,
                inicio: filtros.inicio ? dayjs(filtros.inicio).format('YYYY-MM-DDTHH:mm:ss') : null,
                fim: filtros.fim ? dayjs(filtros.fim).format('YYYY-MM-DDTHH:mm:ss') : null,
                acao: filtros.acao === 'TODAS' ? '' : filtros.acao
            };

            const data = await getAuditLogs(filtrosApi, pageIndex, 20);

            setLogs(data.content || []);
            setTotalPages(data.totalPages || 0);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao carregar logs de auditoria.");
        } finally {
            setLoading(false);
        }
    }, [filtros]);

    // --- EFFECT: Monitora mudança de página ---
    useEffect(() => {
        fetchLogs(page);
    }, [page, fetchLogs]);

    // --- HANDLERS ---
    const handleFilterChange = (e) => {
        setFiltros({ ...filtros, [e.target.name]: e.target.value });
    };

    const handleSearch = () => {
        if (page === 0) {
            // Se já estamos na página 0, forçamos a busca manualmente
            fetchLogs(0);
        } else {
            // Se estamos em outra página, voltamos para a 0
            // O useEffect vai detectar a mudança e chamar fetchLogs(0)
            setPage(0);
        }
    };

    // --- MANIPULAÇÃO DE JSON ---
    const tryParseJSON = (jsonString) => {
        if (typeof jsonString === 'object' && jsonString !== null) return jsonString;
        try {
            const o = JSON.parse(jsonString);
            if (o && typeof o === 'string') return tryParseJSON(o);
            return o;
        } catch (e) {
            return jsonString;
        }
    };

    const handleOpenDetails = (log) => {
        let dadosLimpos = null;
        if (log.dados) {
            dadosLimpos = tryParseJSON(log.dados);
        }
        setParsedData(dadosLimpos);
        setSelectedLog(log);
    };

    const getActionColor = (evento) => {
        switch (evento) {
            case 'CREATE': return 'success';
            case 'UPDATE': return 'info';
            case 'DELETE': return 'error';
            default: return 'default';
        }
    };

    const formatarData = (dataIso) => {
        if (!dataIso) return '-';
        const dataSemZ = dataIso.endsWith('Z') ? dataIso.slice(0, -1) : dataIso;
        return dayjs(dataSemZ).format('DD/MM/YYYY HH:mm:ss');
    };

    const formatVal = (val) => {
        if (val === null || val === undefined) return <span style={{ color: '#ccc' }}>(vazio)</span>;
        if (typeof val === 'boolean') return <Chip label={val ? "Sim" : "Não"} size="small" color={val ? "success" : "default"} variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />;
        if (String(val).trim() === '') return <span style={{ color: '#ccc' }}>(string vazia)</span>;
        return String(val);
    };

    // --- RENDERIZAÇÃO DO DIFF ---
    const renderObjectTable = (data) => {
        if (!data || typeof data !== 'object') return null;
        return (
            <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                <Table size="small">
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                            <TableCell sx={{ width: '30%' }}><b>Campo</b></TableCell>
                            <TableCell><b>Valor Registrado</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {Object.keys(data).map((key) => {
                            const val = data[key];
                            const isComplex = typeof val === 'object' && val !== null;
                            return (
                                <TableRow key={key} hover>
                                    <TableCell sx={{ fontWeight: 500, color: 'text.secondary', textTransform: 'capitalize', verticalAlign: 'top' }}>
                                        {key.replace(/([A-Z])/g, ' $1').trim()}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                        {isComplex ? (
                                            <Box sx={{ bgcolor: '#f1f5f9', p: 1, borderRadius: 1, maxHeight: 200, overflow: 'auto' }}>
                                                <pre style={{ margin: 0 }}>{JSON.stringify(val, null, 2)}</pre>
                                            </Box>
                                        ) : formatVal(val)}
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </TableContainer>
        );
    };

    const renderDiffContent = () => {
        if (!parsedData || typeof parsedData !== 'object') {
            return (
                <Box p={2} bgcolor="#f8fafc" borderRadius={1} border="1px solid #e2e8f0">
                    <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                        {String(parsedData || 'Sem detalhes técnicos.')}
                    </Typography>
                </Box>
            );
        }

        const chaves = Object.keys(parsedData);
        const ehDiffReal = chaves.some(key => {
            const val = parsedData[key];
            return val && typeof val === 'object' && ('de' in val || 'para' in val);
        });

        if (ehDiffReal) {
            return (
                <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f1f5f9' }}>
                            <TableRow>
                                <TableCell><b>Campo Alterado</b></TableCell>
                                <TableCell sx={{ color: 'error.main', width: '40%' }}><b>Valor Antigo</b></TableCell>
                                <TableCell align="center" sx={{ width: '5%' }}><ArrowRight size={16} /></TableCell>
                                <TableCell sx={{ color: 'success.main', width: '40%' }}><b>Valor Novo</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {chaves.map((campo) => {
                                const change = parsedData[campo];
                                if (!change || typeof change !== 'object' || (!('de' in change) && !('para' in change))) return null;
                                return (
                                    <TableRow key={campo} hover>
                                        <TableCell sx={{ fontWeight: 'bold', textTransform: 'capitalize' }}>
                                            {campo.replace(/([A-Z])/g, ' $1').trim()}
                                        </TableCell>
                                        <TableCell sx={{ color: 'text.secondary', fontFamily: 'monospace', fontSize: '0.85rem' }}>{formatVal(change.de)}</TableCell>
                                        <TableCell align="center"><ArrowRight size={14} color="#cbd5e1" /></TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '0.85rem' }}>{formatVal(change.para)}</TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            );
        }

        if (parsedData.BACKUP_EXCLUSAO) {
            return (
                <Box>
                    <Alert severity="warning" sx={{ mb: 2 }}>Registro dos dados que foram excluídos permanentemente.</Alert>
                    {renderObjectTable(parsedData.BACKUP_EXCLUSAO)}
                </Box>
            );
        }

        return renderObjectTable(parsedData);
    };

    return (
        <Box sx={{ width: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                        <HistoryIcon size={28} /> Auditoria do Sistema
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Rastreabilidade de eventos e alterações (Logs).
                    </Typography>
                </Box>
                <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={() => fetchLogs(page)} disabled={loading}>
                    Atualizar
                </Button>
            </Box>

            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField label="Início" type="datetime-local" fullWidth size="small" name="inicio" value={filtros.inicio} onChange={handleFilterChange} InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField label="Fim" type="datetime-local" fullWidth size="small" name="fim" value={filtros.fim} onChange={handleFilterChange} InputLabelProps={{ shrink: true }} />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField label="Usuário" fullWidth size="small" name="usuario" value={filtros.usuario} onChange={handleFilterChange} placeholder="Ex: admin" />
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField select label="Ação" fullWidth size="small" name="acao" value={filtros.acao} onChange={handleFilterChange}>
                            <MenuItem value="TODAS">Todas</MenuItem>
                            <MenuItem value="CREATE">Criação (Create)</MenuItem>
                            <MenuItem value="UPDATE">Alteração (Update)</MenuItem>
                            <MenuItem value="DELETE">Exclusão (Delete)</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12} sm={6} md={2}>
                        <TextField label="Entidade" fullWidth size="small" name="entidade" value={filtros.entidade} onChange={handleFilterChange} placeholder="Ex: Produto" />
                    </Grid>
                    <Grid item xs={12} md={2}>
                        <Button variant="contained" fullWidth onClick={handleSearch} startIcon={<Search size={18} />}>Filtrar</Button>
                    </Grid>
                </Grid>
            </Paper>

            <Paper sx={{ width: '100%', mb: 2, overflow: 'hidden', borderRadius: 2 }}>
                <TableContainer>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: 'background.subtle' }}>
                            <TableRow>
                                <TableCell><b>Responsável</b></TableCell>
                                <TableCell><b>Data/Hora</b></TableCell>
                                <TableCell><b>Origem (IP)</b></TableCell>
                                <TableCell><b>Ação</b></TableCell>
                                <TableCell><b>Alvo</b></TableCell>
                                <TableCell align="center"><b>Detalhes</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {logs.map((log) => (
                                <TableRow key={log.id} hover>
                                    <TableCell><Typography variant="body2" fontWeight="bold" color="primary.main">{log.usuario}</Typography></TableCell>
                                    <TableCell>{formatarData(log.dataHora)}</TableCell>
                                    <TableCell>{log.ipOrigem || '-'}</TableCell>
                                    <TableCell><Chip label={log.evento} color={getActionColor(log.evento)} size="small" variant="outlined" sx={{ fontWeight: 'bold', minWidth: 80 }} /></TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{log.entidade}</Typography>
                                        <Typography variant="caption" color="text.secondary">ID: {log.entidadeId}</Typography>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Ver Alterações">
                                            <IconButton size="small" onClick={() => handleOpenDetails(log)}><Eye size={18} color="#475569" /></IconButton>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && logs.length === 0 && (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>Nenhum registro encontrado no período.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                <Box display="flex" justifyContent="center" p={2}>
                    <Pagination
                        count={totalPages}
                        page={page + 1}
                        onChange={(e, value) => setPage(value - 1)}
                        color="primary"
                        showFirstButton
                        showLastButton
                        disabled={loading} // <--- CORREÇÃO: Removido check de totalPages <= 1
                    />
                </Box>
            </Paper>

            <Dialog open={!!selectedLog} onClose={() => setSelectedLog(null)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <FileJson size={24} color="#475569" />Detalhes da Auditoria
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    {selectedLog && (
                        <Box>
                            <Grid container spacing={2} mb={3}>
                                <Grid item xs={3}><Typography variant="caption" color="text.secondary">Responsável</Typography><Typography variant="body2" fontWeight="bold">{selectedLog.usuario}</Typography></Grid>
                                <Grid item xs={3}><Typography variant="caption" color="text.secondary">Data</Typography><Typography variant="body2">{formatarData(selectedLog.dataHora)}</Typography></Grid>
                                <Grid item xs={3}><Typography variant="caption" color="text.secondary">Origem (IP)</Typography><Typography variant="body2">{selectedLog.ipOrigem || 'Não registrado'}</Typography></Grid>
                                <Grid item xs={3}><Typography variant="caption" color="text.secondary">Ação</Typography><Typography variant="body2">{selectedLog.evento} em <b>{selectedLog.entidade}</b> (ID: {selectedLog.entidadeId})</Typography></Grid>
                            </Grid>
                            <Divider textAlign="left" sx={{ mb: 2 }}><Typography variant="caption" color="text.secondary">CONTEÚDO REGISTRADO</Typography></Divider>
                            {renderDiffContent()}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions><Button onClick={() => setSelectedLog(null)}>Fechar</Button></DialogActions>
            </Dialog>
        </Box>
    );
};

export default AuditoriaList;