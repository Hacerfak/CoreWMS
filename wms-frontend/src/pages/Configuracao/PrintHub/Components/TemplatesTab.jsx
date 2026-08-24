import { useState, useEffect } from 'react';
import {
    Box, Button, Paper, TextField, MenuItem, Typography,
    IconButton, Chip, Tooltip, FormControlLabel, Checkbox, Divider,
    Card, CardContent, CardActions, Grid
} from '@mui/material';
import {
    Save, Plus, Trash2, Code, Copy, FileText, Ruler, Settings,
    ArrowLeft, Printer, Edit, FileCode
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getTemplates, salvarTemplate, excluirTemplate } from '../../../../services/printHubService';

const VARIAVEIS_HELP = {
    'LPN': [
        { var: '{{LPN_CODIGO}}', desc: 'Código LPN' },
        { var: '{{TIPO}}', desc: 'Tipo (PALLET/CX)' },
        { var: '{{SKU}}', desc: 'SKU Principal' },
        { var: '{{DESC}}', desc: 'Descrição Produto' },
        { var: '{{QTD}}', desc: 'Quantidade' },
        { var: '{{LOTE}}', desc: 'Lote' },
        { var: '{{VALIDADE}}', desc: 'Validade' }
    ],
    'VOLUME_EXPEDICAO': [
        { var: '{{RASTREIO}}', desc: 'Cód. Rastreio' },
        { var: '{{PEDIDO}}', desc: 'Num. Pedido' },
        { var: '{{ROTA}}', desc: 'Rota' },
        { var: '{{DESTINATARIO}}', desc: 'Cliente' },
        { var: '{{ENDERECO_COMPLETO}}', desc: 'Endereço' },
        { var: '{{PESO}}', desc: 'Peso Bruto' },
        { var: '{{CIDADE}}', desc: 'Cidade' },
        { var: '{{UF}}', desc: 'UF' }
    ],
    'PRODUTO': [
        { var: '{{SKU}}', desc: 'SKU' },
        { var: '{{NOME}}', desc: 'Nome' },
        { var: '{{EAN}}', desc: 'EAN-13' },
        { var: '{{DUN}}', desc: 'DUN-14' },
        { var: '{{UN}}', desc: 'Un. Medida' },
        { var: '{{DEPOSITANTE}}', desc: 'Depositante' }
    ],
    'LOCALIZACAO': [
        { var: '{{CODIGO}}', desc: 'Código Local' },
        { var: '{{ENDERECO_COMPLETO}}', desc: 'Endereço Completo' },
        { var: '{{AREA}}', desc: 'Área' },
        { var: '{{ARMAZEM}}', desc: 'Armazém' },
        { var: '{{TIPO}}', desc: 'Tipo' }
    ]
};

const TemplatesTab = () => {
    const [viewMode, setViewMode] = useState('list');
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
        id: null,
        nome: '',
        tipoFinalidade: 'LPN',
        zplCodigo: '',
        larguraMm: 100,
        alturaMm: 150,
        padrao: false
    });

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            setLoading(true);
            const data = await getTemplates();
            setTemplates(data || []);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao carregar templates");
        } finally {
            setLoading(false);
        }
    };

    const handleNew = () => {
        setForm({
            id: null,
            nome: '',
            tipoFinalidade: 'LPN',
            zplCodigo: '^XA\n\n^XZ',
            larguraMm: 100,
            alturaMm: 150,
            padrao: false
        });
        setViewMode('form');
    };

    const handleEdit = (tmpl) => {
        setForm({ ...tmpl });
        setViewMode('form');
    };

    const handleBack = () => {
        setViewMode('list');
    };

    const handleSave = async () => {
        if (!form.nome || !form.zplCodigo) return toast.warning("Nome e ZPL são obrigatórios");
        try {
            await salvarTemplate(form);
            toast.success("Template salvo com sucesso!");
            load();
            setViewMode('list');
        } catch (e) {
            toast.error("Erro ao salvar template.");
        }
    };

    const handleDelete = async (id) => {
        if (!confirm("Tem certeza que deseja remover este template?")) return;
        try {
            await excluirTemplate(id);
            toast.success("Template removido!");
            load();
        } catch (e) {
            toast.error("Erro ao remover template.");
        }
    };

    const copyVar = (text) => {
        navigator.clipboard.writeText(text);
        toast.info(`Copiado: ${text}`, { autoClose: 1000, position: "bottom-center" });
    };

    // --- VIEW: LISTA ---
    if (viewMode === 'list') {
        return (
            <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                    <Box>
                        <Typography variant="h6" fontWeight="bold" color="text.primary">
                            Modelos de Etiqueta
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            Gerencie os layouts ZPL utilizados nas impressões.
                        </Typography>
                    </Box>
                    <Button variant="contained" startIcon={<Plus size={18} />} onClick={handleNew}>
                        Novo Template
                    </Button>
                </Box>

                <Grid container spacing={2}>
                    {templates.map((tpl) => (
                        <Grid item xs={12} sm={6} md={4} lg={3} key={tpl.id}>
                            <Card elevation={0} sx={{
                                border: '1px solid #e2e8f0', borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column',
                                transition: '0.2s', '&:hover': { borderColor: 'primary.main', boxShadow: '0 4px 12px rgba(0,0,0,0.05)', transform: 'translateY(-2px)' }
                            }}>
                                <CardContent sx={{ flexGrow: 1, p: 2 }}>
                                    <Box display="flex" justifyContent="space-between" alignItems="start" mb={1}>
                                        <Box p={0.8} bgcolor="primary.lighter" borderRadius={1} color="primary.main">
                                            <FileCode size={20} />
                                        </Box>
                                        {tpl.padrao && <Chip label="Padrão" size="small" color="primary" sx={{ height: 20, fontSize: '0.65rem' }} />}
                                    </Box>
                                    <Typography variant="subtitle1" fontWeight="600" noWrap title={tpl.nome}>{tpl.nome}</Typography>
                                    <Box display="flex" gap={1} mt={1} flexWrap="wrap">
                                        <Chip label={tpl.tipoFinalidade} size="small" variant="outlined" sx={{ borderRadius: 1 }} />
                                        <Chip label={`${tpl.larguraMm}x${tpl.alturaMm}mm`} size="small" variant="outlined" sx={{ borderRadius: 1 }} />
                                    </Box>
                                </CardContent>
                                <Divider />
                                <CardActions sx={{ justifyContent: 'flex-end', p: 1 }}>
                                    <Tooltip title="Excluir">
                                        <IconButton size="small" color="error" onClick={() => handleDelete(tpl.id)}><Trash2 size={16} /></IconButton>
                                    </Tooltip>
                                    <Button size="small" startIcon={<Edit size={14} />} onClick={() => handleEdit(tpl)}>Editar</Button>
                                </CardActions>
                            </Card>
                        </Grid>
                    ))}
                    {templates.length === 0 && !loading && (
                        <Grid item xs={12}>
                            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={6} bgcolor="#f8fafc" borderRadius={2} border="2px dashed #e2e8f0">
                                <Printer size={40} color="#94a3b8" />
                                <Typography variant="body1" color="text.secondary" mt={2}>Nenhum modelo cadastrado</Typography>
                                <Button onClick={handleNew} sx={{ mt: 1 }}>Criar o primeiro modelo</Button>
                            </Box>
                        </Grid>
                    )}
                </Grid>
            </Box>
        );
    }

    // --- VIEW: FORMULÁRIO (LAYOUT FLEXBOX) ---
    return (
        <Box sx={{ height: 'calc(100vh - 180px)', minHeight: 500, display: 'flex', flexDirection: 'column' }}>
            {/* Header Form */}
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                <Box display="flex" alignItems="center" gap={1}>
                    <Button startIcon={<ArrowLeft size={18} />} onClick={handleBack} color="inherit">Voltar</Button>
                    <Typography variant="h6" fontWeight="bold">{form.id ? 'Editar Modelo' : 'Novo Modelo'}</Typography>
                </Box>
                <Button variant="contained" startIcon={<Save size={18} />} onClick={handleSave} sx={{ px: 4 }}>Salvar</Button>
            </Box>

            {/* CONTAINER PRINCIPAL FLEX */}
            <Box sx={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden' }}>

                {/* 1. COLUNA ESQUERDA: Largura Fixa (280px) */}
                <Box sx={{ width: 280, flexShrink: 0, height: '100%', overflowY: 'auto' }}>
                    <Paper sx={{ p: 2, height: '100%', border: '1px solid #e2e8f0' }}>
                        <Typography variant="overline" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                            <Settings size={14} /> Dados Básicos
                        </Typography>

                        <Box display="flex" flexDirection="column" gap={2} mt={2}>
                            <TextField label="Nome do Modelo" fullWidth size="small" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} />

                            <TextField select label="Finalidade" fullWidth size="small" value={form.tipoFinalidade} onChange={e => setForm({ ...form, tipoFinalidade: e.target.value })}>
                                <MenuItem value="LPN">Etiqueta LPN</MenuItem>
                                <MenuItem value="VOLUME_EXPEDICAO">Volumes</MenuItem>
                                <MenuItem value="PRODUTO">Produto</MenuItem>
                                <MenuItem value="LOCALIZACAO">Endereço</MenuItem>
                            </TextField>

                            <Divider sx={{ my: 1 }} />

                            <Typography variant="overline" color="text.secondary" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                                <Ruler size={14} /> Dimensões (mm)
                            </Typography>

                            <Box display="flex" gap={1}>
                                <TextField label="Largura" type="number" size="small" fullWidth value={form.larguraMm} onChange={e => setForm({ ...form, larguraMm: e.target.value })} />
                                <TextField label="Altura" type="number" size="small" fullWidth value={form.alturaMm} onChange={e => setForm({ ...form, alturaMm: e.target.value })} />
                            </Box>

                            <Divider sx={{ my: 1 }} />

                            <FormControlLabel control={<Checkbox checked={form.padrao} onChange={e => setForm({ ...form, padrao: e.target.checked })} />} label={<Typography variant="body2">Definir como Padrão</Typography>} />
                        </Box>
                    </Paper>
                </Box>

                {/* 2. COLUNA DIREITA: Ocupa todo o resto (Flex 1) */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                    <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', border: '1px solid #e2e8f0', bgcolor: '#1e293b' }}>

                        {/* Toolbar do Editor */}
                        <Box sx={{ p: 1.5, bgcolor: '#0f172a', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #334155' }}>
                            <Code size={16} />
                            <Typography variant="caption" fontFamily="monospace" fontWeight="bold">EDITOR ZPL</Typography>
                            <Box flex={1} />
                            <Chip label="RAW ZPL" size="small" sx={{ bgcolor: '#334155', color: 'white', height: 20, fontSize: '0.65rem' }} />
                        </Box>

                        {/* Área de Texto */}
                        <TextField
                            multiline
                            fullWidth
                            value={form.zplCodigo || ''}
                            onChange={e => setForm({ ...form, zplCodigo: e.target.value })}
                            sx={{
                                flex: 1,
                                minHeight: 200,
                                '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start', p: 2 },
                                '& textarea': {
                                    color: '#a5b4fc',
                                    fontFamily: '"Fira Code", Consolas, monospace',
                                    fontSize: '0.9rem',
                                    lineHeight: 1.5,
                                    height: '100% !important',
                                    overflow: 'auto !important'
                                },
                                '& fieldset': { border: 'none' }
                            }}
                            placeholder="Cole seu código ^XA ... ^XZ aqui"
                        />

                        {/* Rodapé Variáveis */}
                        <Box sx={{ p: 2, bgcolor: '#ffffff', borderTop: '1px solid #e2e8f0', flexShrink: 0, maxHeight: '30%', overflowY: 'auto' }}>
                            <Typography variant="subtitle2" fontWeight="bold" color="primary" mb={1} display="flex" alignItems="center" gap={1}>
                                <FileText size={16} /> Variáveis Disponíveis ({form.tipoFinalidade})
                            </Typography>
                            <Box display="flex" flexWrap="wrap" gap={1}>
                                {(VARIAVEIS_HELP[form.tipoFinalidade] || []).map((v, i) => (
                                    <Tooltip key={i} title={v.desc} arrow>
                                        <Chip
                                            label={v.var}
                                            onClick={() => copyVar(v.var)}
                                            icon={<Copy size={12} />}
                                            sx={{
                                                fontFamily: 'monospace', bgcolor: '#f1f5f9', border: '1px solid #cbd5e1', fontWeight: 600, cursor: 'pointer',
                                                '&:hover': { bgcolor: '#e2e8f0', borderColor: 'primary.main', color: 'primary.main' }
                                            }}
                                        />
                                    </Tooltip>
                                ))}
                                {(!VARIAVEIS_HELP[form.tipoFinalidade] || VARIAVEIS_HELP[form.tipoFinalidade].length === 0) && (
                                    <Typography variant="caption" color="text.secondary">Nenhuma variável mapeada para este tipo.</Typography>
                                )}
                            </Box>
                        </Box>
                    </Paper>
                </Box>
            </Box>
        </Box>
    );
};

export default TemplatesTab;