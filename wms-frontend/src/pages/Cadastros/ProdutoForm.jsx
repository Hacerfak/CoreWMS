import { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, TextField, Grid, Paper, Typography, InputAdornment,
    Divider, FormControlLabel, Switch, Tabs, Tab, Fade, IconButton
} from '@mui/material';
import {
    Save, ArrowLeft, Package, FileText, Settings, Barcode,
    Search, DollarSign, Scale, Truck, AlertTriangle, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate, useParams } from 'react-router-dom';
import { salvarProduto, getProdutoById } from '../../services/produtoService';
import { getParceiros } from '../../services/parceiroService';
import SearchableSelect from '../../components/SearchableSelect';

const ProdutoForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [depositantes, setDepositantes] = useState([]);

    const [form, setForm] = useState({
        depositanteId: '', sku: '', nome: '', ean13: '', dun14: '',
        unidadeMedida: 'UN', unidadeArmazenagem: 'UN',
        fatorConversao: 1,
        fatorEmpilhamento: 1, // <--- NOVO CAMPO (Padrão 1 = Não empilha)
        pesoBrutoKg: '', ncm: '', cest: '', valorUnitarioPadrao: '',
        controlaLote: false, controlaValidade: false, controlaSerie: false, ativo: true
    });

    useEffect(() => { loadData(); }, [id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const listaParceiros = await getParceiros();
            const opts = listaParceiros.map(p => ({ value: p.id, label: p.nome }));
            setDepositantes(opts);

            if (id) {
                const data = await getProdutoById(id);
                setForm({
                    ...data,
                    depositanteId: data.depositante?.id || data.depositanteId || '',
                    // Garante valor padrão se vier nulo do banco antigo
                    fatorEmpilhamento: data.fatorEmpilhamento || 1
                });
            } else if (listaParceiros.length > 0) {
                setForm(prev => ({ ...prev, depositanteId: listaParceiros[0].id }));
            }
        } catch (error) {
            console.error(error);
            toast.error("Erro ao carregar dados.");
            navigate('/cadastros/produtos');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const handleSwitchChange = (field) => setForm(prev => ({ ...prev, [field]: !prev[field] }));

    const handleSubmit = async () => {
        if (!form.sku || !form.nome || !form.depositanteId) return toast.warning("Preencha SKU, Nome e Depositante.");
        setLoading(true);
        try {
            await salvarProduto({ ...form, id });
            toast.success("Produto salvo com sucesso!");
            navigate('/cadastros/produtos');
        } catch (error) {
            toast.error(error.response?.data?.message || "Erro ao salvar.");
        } finally {
            setLoading(false);
        }
    };

    const sections = useMemo(() => [
        {
            id: 'geral',
            tabIndex: 0,
            title: 'Identificação & Geral',
            icon: <Package size={20} />,
            color: 'primary.main',
            fields: [
                {
                    key: 'depositante', label: 'Depositante (Dono)', cols: 6,
                    component: <SearchableSelect label="Depositante" value={form.depositanteId} onChange={e => handleChange('depositanteId', e.target.value)} options={depositantes} required />
                },
                {
                    key: 'sku', label: 'SKU (Código)', cols: 6,
                    component: <TextField label="SKU" fullWidth required value={form.sku} onChange={e => handleChange('sku', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'nome', label: 'Descrição do Produto', cols: 12,
                    component: <TextField label="Descrição / Nome" fullWidth required value={form.nome} onChange={e => handleChange('nome', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'ean', label: 'EAN-13 (Código de Barras)', cols: 6,
                    component: <TextField label="EAN-13" fullWidth value={form.ean13} onChange={e => handleChange('ean13', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Barcode size={18} color="#666" /></InputAdornment> }} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'dun', label: 'DUN-14 (Caixa Master)', cols: 6,
                    component: <TextField label="DUN-14" fullWidth value={form.dun14} onChange={e => handleChange('dun14', e.target.value)} InputLabelProps={{ shrink: true }} />
                }
            ]
        },
        {
            id: 'logistica',
            tabIndex: 1,
            title: 'Logística & Medidas',
            icon: <Truck size={20} />,
            color: 'info.main',
            fields: [
                {
                    key: 'peso', label: 'Peso Bruto', cols: 4,
                    component: <TextField label="Peso Bruto (kg)" type="number" fullWidth value={form.pesoBrutoKg} onChange={e => handleChange('pesoBrutoKg', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Scale size={18} color="#666" /></InputAdornment> }} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'un_base', label: 'Unidade Base', cols: 4,
                    component: <TextField label="Un. Base (Ex: UN)" fullWidth value={form.unidadeMedida} onChange={e => handleChange('unidadeMedida', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'un_arm', label: 'Unidade Armazenagem', cols: 4,
                    component: <TextField label="Un. Armazenagem (Ex: CX)" fullWidth value={form.unidadeArmazenagem} onChange={e => handleChange('unidadeArmazenagem', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                // --- MUDANÇA AQUI: Dividimos a linha para caber o Empilhamento ---
                {
                    key: 'fator', label: 'Fator de Conversão', cols: 6,
                    component: <TextField label="Fator Conversão" type="number" fullWidth value={form.fatorConversao} onChange={e => handleChange('fatorConversao', e.target.value)} helperText="Qtd Base na Un. Armazenagem" InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'empilhamento', label: 'Fator Empilhamento', cols: 6,
                    component: <TextField
                        label="Empilhamento Máximo"
                        type="number"
                        fullWidth
                        value={form.fatorEmpilhamento}
                        onChange={e => handleChange('fatorEmpilhamento', e.target.value)}
                        helperText="Quantas alturas (1 = Não empilha)"
                        InputLabelProps={{ shrink: true }}
                    />
                }
            ]
        },
        {
            id: 'fiscal',
            tabIndex: 1,
            title: 'Dados Fiscais',
            icon: <FileText size={20} />,
            color: 'warning.main',
            fields: [
                {
                    key: 'ncm', label: 'NCM', cols: 4,
                    component: <TextField label="NCM" fullWidth value={form.ncm} onChange={e => handleChange('ncm', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'cest', label: 'CEST', cols: 4,
                    component: <TextField label="CEST" fullWidth value={form.cest} onChange={e => handleChange('cest', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'valor', label: 'Valor Unitário', cols: 4,
                    component: <TextField label="Valor Unitário" type="number" fullWidth value={form.valorUnitarioPadrao} onChange={e => handleChange('valorUnitarioPadrao', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><DollarSign size={16} /></InputAdornment> }} InputLabelProps={{ shrink: true }} />
                }
            ]
        },
        {
            id: 'controles',
            tabIndex: 2,
            title: 'Rastreabilidade',
            icon: <Settings size={20} />,
            color: 'error.main',
            fields: [
                {
                    key: 'lote', label: 'Controla Lote', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.controlaLote} onChange={() => handleSwitchChange('controlaLote')} />} label="Exigir Lote (Batch)" />
                },
                {
                    key: 'validade', label: 'Controla Validade', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.controlaValidade} onChange={() => handleSwitchChange('controlaValidade')} />} label="Exigir Data de Validade" />
                },
                {
                    key: 'serie', label: 'Controla Série', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.controlaSerie} onChange={() => handleSwitchChange('controlaSerie')} />} label="Exigir Número de Série (Serial Único)" />
                }
            ]
        }
    ], [form, depositantes]);

    const visibleSections = useMemo(() => {
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            return sections.map(section => ({
                ...section,
                fields: section.fields.filter(f =>
                    f.label.toLowerCase().includes(term) ||
                    section.title.toLowerCase().includes(term)
                )
            })).filter(section => section.fields.length > 0);
        } else {
            return sections.filter(section => section.tabIndex === activeTab);
        }
    }, [sections, searchTerm, activeTab]);

    return (
        <Box sx={{ width: '100%', pb: 5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/cadastros/produtos')} color="inherit" sx={{ borderColor: 'divider' }} variant="outlined">
                        Voltar
                    </Button>
                    <Box>
                        <Typography variant="h5" fontWeight="bold" color="text.primary">
                            {id ? 'Editar Produto' : 'Novo Produto'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {id ? `SKU: ${form.sku}` : 'Preencha a ficha técnica do item.'}
                        </Typography>
                    </Box>
                </Box>
                <Box display="flex" alignItems="center" gap={2} bgcolor="background.paper" p={1} borderRadius={2} border={1} borderColor="divider">
                    <FormControlLabel
                        control={<Switch color="success" checked={form.ativo} onChange={() => handleSwitchChange('ativo')} />}
                        label={<Typography variant="body2" fontWeight={600} color={form.ativo ? 'success.main' : 'text.disabled'}>{form.ativo ? 'ATIVO' : 'INATIVO'}</Typography>}
                        sx={{ ml: 1, mr: 0 }}
                    />
                    <Divider orientation="vertical" flexItem />
                    <Button variant="contained" startIcon={<Save size={20} />} onClick={handleSubmit} disabled={loading}>
                        Salvar
                    </Button>
                </Box>
            </Box>

            <Paper sx={{ width: '100%', mb: 2, borderRadius: 2, overflow: 'hidden' }}>
                <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc', px: 2, pt: 2 }}>
                    <TextField
                        fullWidth
                        placeholder="Pesquisar campo (ex: NCM, Peso, Lote)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        size="small"
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search size={18} color="#94a3b8" /></InputAdornment>,
                            endAdornment: searchTerm && (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setSearchTerm('')}><X size={16} /></IconButton>
                                </InputAdornment>
                            ),
                            sx: { bgcolor: 'white', mb: 2 }
                        }}
                    />
                    {!searchTerm && (
                        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                            <Tab label="Geral" icon={<Package size={18} />} iconPosition="start" />
                            <Tab label="Fiscal & Medidas" icon={<Scale size={18} />} iconPosition="start" />
                            <Tab label="Controles" icon={<Settings size={18} />} iconPosition="start" />
                        </Tabs>
                    )}
                    {searchTerm && (
                        <Typography variant="caption" color="primary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
                            Exibindo resultados da pesquisa em todas as seções:
                        </Typography>
                    )}
                </Box>

                <Box sx={{ p: 4, bgcolor: '#fff' }}>
                    <Grid container spacing={3} alignItems="flex-start">
                        {visibleSections.map((section) => (
                            <Grid item xs={12} md={6} lg={6} key={section.title}>
                                <Fade in={true}>
                                    <Paper
                                        variant="outlined"
                                        sx={{
                                            borderRadius: 3,
                                            overflow: 'hidden',
                                            height: '100%',
                                            borderLeft: 4,
                                            borderColor: section.color,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                                        }}
                                    >
                                        <Box sx={{ p: 2, bgcolor: '#fbfbfb', borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            {section.icon}
                                            <Typography variant="subtitle1" fontWeight="bold">{section.title}</Typography>
                                        </Box>
                                        <Box sx={{ p: 3 }}>
                                            <Grid container spacing={2}>
                                                {section.fields.map((field) => (
                                                    <Grid item xs={12} sm={field.cols || 12} key={field.key}>
                                                        {field.component}
                                                    </Grid>
                                                ))}
                                            </Grid>
                                        </Box>
                                    </Paper>
                                </Fade>
                            </Grid>
                        ))}
                        {visibleSections.length === 0 && (
                            <Grid item xs={12}>
                                <Box textAlign="center" py={5}>
                                    <AlertTriangle size={40} color="#cbd5e1" />
                                    <Typography color="text.secondary" mt={2}>Nenhum campo encontrado para "{searchTerm}".</Typography>
                                    <Button size="small" onClick={() => setSearchTerm('')} sx={{ mt: 1 }}>Limpar Busca</Button>
                                </Box>
                            </Grid>
                        )}
                    </Grid>
                </Box>
            </Paper>
        </Box>
    );
};

export default ProdutoForm;