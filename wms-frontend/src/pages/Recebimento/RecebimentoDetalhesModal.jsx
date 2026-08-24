import { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Typography, Box, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, Divider, Grid, Alert
} from '@mui/material';
import { Package, X, EyeOff } from 'lucide-react';
import { checkExibirQtdRecebimento } from '../../services/configService';

const RecebimentoDetalhesModal = ({ open, onClose, data }) => {
    const [exibirQtdEsperada, setExibirQtdEsperada] = useState(true);

    // Carrega a configuração sempre que o modal abre
    useEffect(() => {
        if (open) {
            carregarConfig();
        }
    }, [open]);

    const carregarConfig = async () => {
        try {
            if (data?.id) {
                const deveExibir = await checkExibirQtdRecebimento(data.id);
                setExibirQtdEsperada(deveExibir === true);
            }
        } catch (error) {
            console.error("Erro ao carregar config", error);
        }
    };

    if (!data) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box display="flex" alignItems="center" gap={1}>
                    <Package size={24} />
                    <Typography variant="h6" fontWeight="bold">
                        Detalhes da Nota {data.numNotaFiscal}
                    </Typography>
                </Box>
                <Box display="flex" gap={1}>
                    {!exibirQtdEsperada && (
                        <Chip icon={<EyeOff size={14} />} label="Modo Cego" color="warning" size="small" variant="outlined" />
                    )}
                    <Chip label={data.status} color={data.status === 'FINALIZADO' ? 'success' : 'warning'} size="small" />
                </Box>
            </DialogTitle>

            <DialogContent dividers>
                <Grid container spacing={2} mb={3}>
                    <Grid item xs={12} sm={6}>
                        <Typography variant="caption" color="text.secondary">Fornecedor</Typography>
                        <Typography variant="body1" fontWeight={500}>{data.fornecedor}</Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Data Importação</Typography>
                        <Typography variant="body1">
                            {data.dataCriacao ? new Date(data.dataCriacao).toLocaleDateString() : '-'}
                        </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <Typography variant="caption" color="text.secondary">Chave Acesso</Typography>
                        <Typography variant="body2" sx={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>
                            {data.chaveAcesso || '-'}
                        </Typography>
                    </Grid>
                </Grid>

                <Divider sx={{ mb: 2 }}>Itens da Nota</Divider>

                {!exibirQtdEsperada && (
                    <Alert severity="info" sx={{ mb: 2, py: 0 }}>
                        As quantidades totais estão ocultas devido à configuração de conferência cega.
                    </Alert>
                )}

                <TableContainer sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: '#f9fafb' }}>
                            <TableRow>
                                <TableCell><b>SKU</b></TableCell>
                                <TableCell><b>Produto</b></TableCell>

                                {/* Oculta Coluna de Qtd Nota se for cego */}
                                {exibirQtdEsperada && (
                                    <TableCell align="right"><b>Qtd Nota</b></TableCell>
                                )}

                                <TableCell align="right"><b>Qtd Conferida</b></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {data.itens?.map((item) => {
                                // Lógica de Cor: Só pinta de verde/amarelo se NÃO for cego.
                                // Se for cego, mantém neutro para não dar dica de conclusão.
                                const isCompleto = item.quantidadeConferida >= item.quantidadeNota;
                                const corTexto = exibirQtdEsperada
                                    ? (isCompleto ? 'success.main' : 'warning.main')
                                    : 'text.primary';

                                const fontWeight = exibirQtdEsperada ? 'bold' : 'normal';

                                return (
                                    <TableRow key={item.id} hover>
                                        <TableCell>{item.produto.sku}</TableCell>
                                        <TableCell>{item.produto.nome}</TableCell>

                                        {/* Oculta Valor de Qtd Nota se for cego */}
                                        {exibirQtdEsperada && (
                                            <TableCell align="right">{item.quantidadeNota}</TableCell>
                                        )}

                                        <TableCell align="right" sx={{ color: corTexto, fontWeight: fontWeight }}>
                                            {item.quantidadeConferida || 0}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DialogContent>

            <DialogActions>
                <Button onClick={onClose} startIcon={<X size={18} />}>Fechar</Button>
            </DialogActions>
        </Dialog>
    );
};

export default RecebimentoDetalhesModal;