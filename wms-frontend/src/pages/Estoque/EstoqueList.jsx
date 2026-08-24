import { useState, useEffect, useMemo } from 'react';
import {
    Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, LinearProgress, TextField, InputAdornment, Chip, Button, IconButton, Tooltip
} from '@mui/material';
import { Search, Box as BoxIcon, MapPin, RefreshCw, ArrowDownToLine, Printer } from 'lucide-react';
import { toast } from 'react-toastify';
import { getEstoqueDetalhado } from '../../services/estoqueService';
import { useNavigate } from 'react-router-dom';
import Can from '../../components/Can';
import PrintModal from '../../components/PrintModal'; // <--- Importe o Modal

const EstoqueList = () => {
    const navigate = useNavigate();
    const [estoque, setEstoque] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busca, setBusca] = useState('');

    // Estado do Modal de Impressão
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [selectedLpn, setSelectedLpn] = useState(null); // { id, codigo }

    useEffect(() => { loadData(); }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getEstoqueDetalhado();
            setEstoque(data);
        } catch (error) {
            toast.error("Erro ao carregar estoque.");
        } finally {
            setLoading(false);
        }
    };

    const filteredData = useMemo(() => {
        const term = busca.toLowerCase();
        return estoque.filter(item =>
            item.produto.sku.toLowerCase().includes(term) ||
            item.produto.nome.toLowerCase().includes(term) ||
            item.localizacao.enderecoCompleto.toLowerCase().includes(term) ||
            (item.lpn && item.lpn.toLowerCase().includes(term))
        );
    }, [estoque, busca]);

    const getValidadeStatus = (dataValidade) => {
        if (!dataValidade) return null;
        const hoje = new Date();
        const validade = new Date(dataValidade);
        const diasRestantes = Math.ceil((validade - hoje) / (1000 * 60 * 60 * 24));

        if (diasRestantes < 0) return <Chip label="Vencido" color="error" size="small" />;
        if (diasRestantes < 30) return <Chip label={`Vence em ${diasRestantes}d`} color="warning" size="small" />;
        return <Typography variant="caption">{new Date(dataValidade).toLocaleDateString()}</Typography>;
    };

    // Ação ao clicar no botão de imprimir
    const handleOpenPrint = (row) => {
        // row.lpnId precisa vir do backend. Se o objeto row já tiver o ID da LPN:
        // Caso seu endpoint getEstoqueDetalhado retorne o objeto LPN completo dentro, ajuste aqui.
        // Assumindo que row tem { lpn: "LPN123", lpnId: 10, ... }
        if (row.lpnId) {
            setSelectedLpn({ id: row.lpnId, codigo: row.lpn });
            setPrintModalOpen(true);
        } else {
            toast.warn("Item sem LPN associada ou ID não carregado.");
        }
    };

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                        <BoxIcon /> Estoque Atual
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Visão detalhada de saldos por endereço e lote.
                    </Typography>
                </Box>
                <Box display="flex" gap={2}>
                    <Button variant="outlined" startIcon={<RefreshCw size={18} />} onClick={loadData}>
                        Atualizar
                    </Button>
                    <Can I="ESTOQUE_ARMAZENAR">
                        <Button variant="contained" startIcon={<ArrowDownToLine size={18} />} onClick={() => navigate('/estoque/armazenagem')}>
                            Realizar Armazenagem
                        </Button>
                    </Can>
                </Box>
            </Box>

            <Paper sx={{ mb: 2, p: 2 }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Buscar por SKU, Produto, Endereço ou LPN..."
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Search size={18} color="#94a3b8" /></InputAdornment>
                    }}
                />
            </Paper>

            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                {loading && <LinearProgress />}
                <TableContainer sx={{ maxHeight: 600 }}>
                    <Table stickyHeader size="small">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell><b>Endereço</b></TableCell>
                                <TableCell><b>LPN / Pallet</b></TableCell>
                                <TableCell><b>Produto</b></TableCell>
                                <TableCell><b>Lote</b></TableCell>
                                <TableCell><b>Validade</b></TableCell>
                                <TableCell align="right"><b>Qtd. Física</b></TableCell>
                                <TableCell align="right"><b>Qtd. Reservada</b></TableCell>
                                <TableCell align="right"><b>Disponível</b></TableCell>
                                <TableCell align="center"><b>Ações</b></TableCell> {/* Nova Coluna */}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filteredData.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <MapPin size={14} color="#64748b" />
                                            <Typography variant="body2" fontWeight="bold">{row.localizacao.enderecoCompleto}</Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        {row.lpn ? (
                                            <Chip label={row.lpn} size="small" variant="outlined" color="primary" sx={{ fontFamily: 'monospace' }} />
                                        ) : (
                                            <Typography variant="caption" color="text.secondary">Solto</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={500}>{row.produto.sku}</Typography>
                                        <Typography variant="caption" color="text.secondary">{row.produto.nome}</Typography>
                                    </TableCell>
                                    <TableCell>{row.lote || '-'}</TableCell>
                                    <TableCell>{getValidadeStatus(row.dataValidade) || '-'}</TableCell>
                                    <TableCell align="right"><b>{row.quantidade}</b></TableCell>
                                    <TableCell align="right" sx={{ color: 'warning.main' }}>{row.quantidadeReservada > 0 ? row.quantidadeReservada : '-'}</TableCell>
                                    <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                        {row.quantidade - row.quantidadeReservada}
                                    </TableCell>
                                    <TableCell align="center">
                                        {/* Botão de Impressão - Só aparece se tiver LPN */}
                                        {row.lpn && (
                                            <Tooltip title="Imprimir Etiqueta LPN">
                                                <IconButton size="small" color="primary" onClick={() => handleOpenPrint(row)}>
                                                    <Printer size={18} />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {!loading && filteredData.length === 0 && (
                                <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>Nenhum saldo encontrado.</TableCell></TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Paper>

            {/* Modal de Impressão Injetado aqui */}
            {selectedLpn && (
                <PrintModal
                    open={printModalOpen}
                    onClose={() => { setPrintModalOpen(false); setSelectedLpn(null); }}
                    lpnId={selectedLpn.id}
                    lpnCodigo={selectedLpn.codigo}
                />
            )}
        </Box>
    );
};

export default EstoqueList;