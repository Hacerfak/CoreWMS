import { useState } from 'react';
import {
    Box, Typography, Paper, Button, Grid, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Chip,
    Divider, IconButton, CircularProgress
} from '@mui/material';
import { UploadCloud, FileText, Check, X, Trash2, Package, ArrowLeft } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { useNavigate } from 'react-router-dom';

const Recebimento = () => {
    const navigate = useNavigate();
    const [file, setFile] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [loading, setLoading] = useState(false);

    // --- LÓGICA 1: LER O XML NO NAVEGADOR (PREVIEW) ---
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (!selectedFile) return;

        if (selectedFile.type !== 'text/xml') {
            toast.error("Por favor, selecione um arquivo XML válido.");
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parser = new DOMParser();
                const xmlDoc = parser.parseFromString(e.target.result, "text/xml");

                // Função auxiliar para pegar valor de tag com segurança
                const getTag = (tag, parent = xmlDoc) => {
                    const el = parent.getElementsByTagName(tag)[0];
                    return el ? el.textContent : '';
                };

                // Extrai Cabeçalho
                const nNF = getTag('nNF');
                const dhEmi = getTag('dhEmi');
                const emitente = getTag('xNome', xmlDoc.getElementsByTagName('emit')[0]);
                const cnpj = getTag('CNPJ', xmlDoc.getElementsByTagName('emit')[0]);

                // Extrai Itens (Produtos)
                const detElements = xmlDoc.getElementsByTagName('det');
                const itens = [];

                for (let i = 0; i < detElements.length; i++) {
                    const prod = detElements[i].getElementsByTagName('prod')[0];
                    itens.push({
                        sku: getTag('cProd', prod),
                        nome: getTag('xProd', prod),
                        qtd: getTag('qCom', prod),
                        unidade: getTag('uCom', prod),
                        valor: getTag('vUnCom', prod)
                    });
                }

                setPreviewData({ nNF, dhEmi, emitente, cnpj, itens });
                setFile(selectedFile);

            } catch (error) {
                console.error(error);
                toast.error("Erro ao ler o XML. Verifique o formato.");
            }
        };
        reader.readAsText(selectedFile);
    };

    // --- LÓGICA 2: ENVIAR PARA O BACKEND (SALVAR) ---
    const handleImportar = async () => {
        if (!file) return;
        setLoading(true);

        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post('/api/recebimentos/importar', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success(`Nota ${previewData.nNF} importada com sucesso!`);
            // CORREÇÃO: Redireciona para a lista para ver a nova entrada e atribuir doca
            navigate('/recebimento/lista');

        } catch (error) {
            console.error(error);
            const msg = error.response?.data?.message || "Erro ao importar nota.";
            toast.error(msg);
            setLoading(false);
        }
    };

    const handleCancelar = () => {
        setFile(null);
        setPreviewData(null);
    };

    // --- RENDERIZAÇÃO ---
    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/recebimento/lista')} color="inherit">Voltar</Button>
                    <Typography variant="h5" fontWeight="bold" mb={3} color="text.primary">Recebimento de Nota Fiscal</Typography>
                </Box>
            </Box>

            {/* ESTADO 1: NENHUM ARQUIVO SELECIONADO (AREA DE UPLOAD) */}
            {!previewData && (
                <Paper
                    component="label" // O Paper age como botão de upload
                    elevation={0}      // Remove a sombra padrão para ficar mais clean
                    sx={{
                        p: 6,
                        border: '2px dashed',
                        borderColor: 'divider',
                        borderRadius: 4,
                        textAlign: 'center',
                        cursor: 'pointer',
                        bgcolor: '#f8fafc',
                        display: 'flex',            // <--- CORREÇÃO 1: Flexbox
                        flexDirection: 'column',    // <--- CORREÇÃO 2: Coluna
                        alignItems: 'center',       // <--- CORREÇÃO 3: Centralizar
                        justifyContent: 'center',
                        width: '100%',              // <--- CORREÇÃO 4: Largura total
                        '&:hover': {
                            bgcolor: '#f1f5f9',
                            borderColor: 'primary.main',
                        },
                        transition: 'all 0.2s',
                    }}
                >
                    {/* O input deve ter display: none para garantir que não ocupe 1px sequer */}
                    <input
                        type="file"
                        accept=".xml"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />

                    <Box sx={{ mb: 2, color: 'primary.main', display: 'flex', justifyContent: 'center' }}>
                        <UploadCloud size={64} strokeWidth={1.5} />
                    </Box>
                    <Typography variant="h6" color="text.primary" gutterBottom>
                        Clique ou arraste o XML da NFe aqui
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Suporta apenas arquivos .xml
                    </Typography>
                </Paper>
            )}

            {/* ESTADO 2: PREVIEW DOS DADOS (CONFIRMAÇÃO) */}
            {previewData && (
                <Box>
                    {/* Cabeçalho da Nota */}
                    <Paper sx={{ p: 3, mb: 3, borderRadius: 2 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Box display="flex" alignItems="center" gap={2}>
                                <Box p={1.5} bgcolor="primary.light" borderRadius={2} color="white">
                                    <FileText size={24} />
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Depositante</Typography>
                                    <Typography variant="h6" fontWeight="bold">{previewData.emitente}</Typography>
                                    <Typography variant="body2" color="text.secondary">CNPJ: {previewData.cnpj}</Typography>
                                </Box>
                            </Box>
                            <Box textAlign="right">
                                <Chip label={`NFe: ${previewData.nNF}`} color="primary" sx={{ mb: 1, fontWeight: 'bold' }} />
                                <Typography variant="body2" color="text.secondary">
                                    Emissão: {new Date(previewData.dhEmi).toLocaleDateString()}
                                </Typography>
                            </Box>
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        {/* Tabela de Itens */}
                        <Typography variant="subtitle1" fontWeight="bold" mb={2} display="flex" alignItems="center" gap={1}>
                            <Package size={18} /> Itens da Nota ({previewData.itens.length})
                        </Typography>

                        <TableContainer sx={{ maxHeight: 400 }}>
                            <Table stickyHeader size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Produto</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Qtd.</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>Un.</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Valor Un.</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {previewData.itens.map((item, index) => (
                                        <TableRow key={index} hover>
                                            <TableCell>{item.sku}</TableCell>
                                            <TableCell>{item.nome}</TableCell>
                                            <TableCell align="right">
                                                <Chip label={parseFloat(item.qtd).toLocaleString()} size="small" variant="outlined" />
                                            </TableCell>
                                            <TableCell align="center">{item.unidade}</TableCell>
                                            <TableCell align="right">
                                                {parseFloat(item.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Botões de Ação */}
                    <Grid container spacing={2} justifyContent="flex-end">
                        <Grid item>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<Trash2 size={18} />}
                                onClick={handleCancelar}
                                disabled={loading}
                            >
                                Cancelar
                            </Button>
                        </Grid>
                        <Grid item>
                            <Button
                                variant="contained"
                                color="success"
                                size="large"
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <Check size={20} />}
                                onClick={handleImportar}
                                disabled={loading}
                                sx={{ color: 'white' }}
                            >
                                {loading ? "Importando..." : "Confirmar e Importar"}
                            </Button>
                        </Grid>
                    </Grid>
                </Box>
            )}
        </Box>
    );
};

export default Recebimento;