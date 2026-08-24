import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, Grid, Card, CardActionArea,
    CardContent, Typography, Box, CircularProgress
} from '@mui/material';
import { Container, Box as BoxIcon, Package } from 'lucide-react';
import { getFormatosAtivos } from '../../services/formatoLpnService'; // Importar do service criado

const ModalSelecaoFormato = ({ open, onClose, onSelect }) => {
    const [formatos, setFormatos] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (open) {
            loadFormatos();
        }
    }, [open]);

    const loadFormatos = async () => {
        setLoading(true);
        try {
            const data = await getFormatosAtivos();
            setFormatos(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getIcon = (tipo) => {
        switch (tipo) {
            case 'PALLET': return <Container size={32} color="#2563eb" />;
            case 'CAIXA': return <BoxIcon size={32} color="#d97706" />;
            default: return <Package size={32} color="#4b5563" />;
        }
    };

    return (
        <Dialog open={open} onClose={() => onClose()} maxWidth="md" fullWidth>
            <DialogTitle sx={{ textAlign: 'center', fontWeight: 'bold' }}>
                Selecione o Formato de Armazenamento
            </DialogTitle>
            <DialogContent>
                {loading ? (
                    <Box display="flex" justifyContent="center" p={4}><CircularProgress /></Box>
                ) : (
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {formatos.map((fmt) => (
                            <Grid item xs={12} sm={6} md={4} key={fmt.id}>
                                <Card variant="outlined" sx={{
                                    border: '2px solid #e2e8f0',
                                    '&:hover': { borderColor: 'primary.main', bgcolor: '#f8fafc' }
                                }}>
                                    <CardActionArea
                                        onClick={() => onSelect(fmt.id)}
                                        sx={{ height: '100%', p: 2 }}
                                    >
                                        <Box display="flex" flexDirection="column" alignItems="center" gap={2}>
                                            {getIcon(fmt.tipoBase)}

                                            <Box textAlign="center">
                                                <Typography variant="h6" fontWeight="bold">
                                                    {fmt.codigo}
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {fmt.descricao}
                                                </Typography>
                                            </Box>

                                            <Box bgcolor="#f1f5f9" p={1} borderRadius={1} width="100%" textAlign="center">
                                                <Typography variant="caption" display="block" fontWeight="bold">
                                                    {fmt.alturaM}m x {fmt.larguraM}m x {fmt.profundidadeM}m
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    Suporta até {fmt.pesoSuportadoKg} kg
                                                </Typography>
                                            </Box>
                                        </Box>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                )}
            </DialogContent>
        </Dialog>
    );
};

export default ModalSelecaoFormato;