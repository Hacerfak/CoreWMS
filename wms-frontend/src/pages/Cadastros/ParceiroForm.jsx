import { useState, useEffect, useMemo } from 'react';
import {
    Box, Button, TextField, Grid, Paper, Typography, InputAdornment,
    IconButton, Divider, FormControlLabel, Switch, CircularProgress, Tabs, Tab, Fade
} from '@mui/material';
import {
    Save, ArrowLeft, Search, MapPin, Briefcase, Settings,
    AlertTriangle, Mail, Phone, X
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate, useParams } from 'react-router-dom';
import { salvarParceiro, getParceiroById } from '../../services/parceiroService';
import { consultarCnpjSefaz } from '../../services/integracaoService';
import SearchableSelect from '../../components/SearchableSelect';

const ESTADOS_BR = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const UF_OPTIONS = ESTADOS_BR.map(uf => ({ value: uf, label: uf }));

const TIPO_OPTIONS = [
    { value: 'CLIENTE', label: 'Cliente' },
    { value: 'FORNECEDOR', label: 'Fornecedor' },
    { value: 'TRANSPORTADORA', label: 'Transportadora' },
    { value: 'AMBOS', label: 'Híbrido' }
];

const CRT_OPTIONS = [
    { value: '1', label: '1 - Simples Nacional' },
    { value: '2', label: '2 - Simples (Excesso)' },
    { value: '3', label: '3 - Regime Normal' },
    { value: '4', label: '4 - MEI' }
];

const ParceiroForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0); // Controle da Aba
    const [searchTerm, setSearchTerm] = useState(''); // Controle da Busca
    const [buscandoCnpj, setBuscandoCnpj] = useState(false);

    const [form, setForm] = useState({
        documento: '', nome: '', nomeFantasia: '', ie: '', tipo: 'AMBOS', crt: '3',
        cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SP',
        telefone: '', email: '',
        recebimentoCego: false, padraoControlaLote: false, padraoControlaValidade: false, padraoControlaSerie: false, ativo: true
    });

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const data = await getParceiroById(id);
            setForm(data);
        } catch (error) {
            toast.error("Erro ao carregar parceiro.");
            navigate('/cadastros/parceiros');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const handleSwitchChange = (field) => setForm(prev => ({ ...prev, [field]: !prev[field] }));

    const handleBuscarSefaz = async () => {
        const docLimpo = form.documento.replace(/\D/g, '');
        if (docLimpo.length !== 14) return toast.warning("CNPJ inválido.");
        setBuscandoCnpj(true);
        try {
            const dados = await consultarCnpjSefaz(form.uf, docLimpo);
            setForm(prev => ({
                ...prev,
                nome: dados.razaoSocial || prev.nome,
                nomeFantasia: dados.nomeFantasia || prev.nomeFantasia,
                ie: (dados.ie && dados.ie !== 'ISENTO') ? dados.ie : prev.ie,
                crt: dados.regimeTributario || prev.crt,
                cep: dados.cep || prev.cep,
                logradouro: dados.logradouro || prev.logradouro,
                numero: dados.numero || prev.numero,
                complemento: dados.complemento || prev.complemento,
                bairro: dados.bairro || prev.bairro,
                cidade: dados.cidade || prev.cidade,
                uf: dados.uf || prev.uf
            }));
            toast.success("Dados preenchidos via SEFAZ!");
        } catch (error) { toast.error("Erro na consulta."); } finally { setBuscandoCnpj(false); }
    };

    const handleSubmit = async () => {
        setLoading(true);
        try {
            await salvarParceiro({ ...form, id });
            toast.success("Parceiro salvo com sucesso!");
            navigate('/cadastros/parceiros');
        } catch (error) { toast.error(error.response?.data?.message || "Erro ao salvar."); } finally { setLoading(false); }
    };

    // --- ESTRUTURA DE SEÇÕES MAPEADA POR ABA ---
    const sections = useMemo(() => [
        {
            id: 'fiscal',
            tabIndex: 0, // Pertence à Aba 0
            title: 'Identificação & Fiscal',
            icon: <Briefcase size={20} />,
            color: 'primary.main',
            fields: [
                {
                    key: 'uf_busca', label: 'UF (Origem)', cols: 2,
                    component: <SearchableSelect label="UF" value={form.uf} onChange={e => handleChange('uf', e.target.value)} options={UF_OPTIONS} />
                },
                {
                    key: 'doc', label: 'CNPJ / CPF', cols: 4,
                    component: (
                        <TextField
                            label="CNPJ / CPF" fullWidth value={form.documento} onChange={e => handleChange('documento', e.target.value)}
                            InputProps={{ endAdornment: (<InputAdornment position="end"><IconButton onClick={handleBuscarSefaz} disabled={buscandoCnpj || !form.documento} edge="end">{buscandoCnpj ? <CircularProgress size={16} /> : <Search size={18} color="#1976d2" />}</IconButton></InputAdornment>) }}
                        />
                    )
                },
                {
                    key: 'tipo', label: 'Tipo de Parceiro', cols: 3,
                    component: <SearchableSelect label="Tipo" value={form.tipo} onChange={e => handleChange('tipo', e.target.value)} options={TIPO_OPTIONS} />
                },
                {
                    key: 'crt', label: 'Regime (CRT)', cols: 3,
                    component: <SearchableSelect label="Regime Tributário" value={form.crt} onChange={e => handleChange('crt', e.target.value)} options={CRT_OPTIONS} />
                },
                {
                    key: 'razao', label: 'Razão Social', cols: 6,
                    component: <TextField label="Razão Social" fullWidth required value={form.nome} onChange={e => handleChange('nome', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'fantasia', label: 'Nome Fantasia', cols: 3,
                    component: <TextField label="Nome Fantasia" fullWidth value={form.nomeFantasia} onChange={e => handleChange('nomeFantasia', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'ie', label: 'Inscrição Estadual', cols: 3,
                    component: <TextField label="Insc. Estadual" fullWidth value={form.ie} onChange={e => handleChange('ie', e.target.value)} InputLabelProps={{ shrink: true }} />
                }
            ]
        },
        {
            id: 'endereco',
            tabIndex: 1, // Pertence à Aba 1
            title: 'Endereço & Contato',
            icon: <MapPin size={20} />,
            color: 'info.main',
            fields: [
                {
                    key: 'cep', label: 'CEP', cols: 3,
                    component: <TextField label="CEP" fullWidth value={form.cep} onChange={e => handleChange('cep', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'logradouro', label: 'Logradouro', cols: 7,
                    component: <TextField label="Logradouro" fullWidth value={form.logradouro} onChange={e => handleChange('logradouro', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'numero', label: 'Número', cols: 2,
                    component: <TextField label="Número" fullWidth value={form.numero} onChange={e => handleChange('numero', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'bairro', label: 'Bairro', cols: 5,
                    component: <TextField label="Bairro" fullWidth value={form.bairro} onChange={e => handleChange('bairro', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'cidade', label: 'Cidade', cols: 5,
                    component: <TextField label="Cidade" fullWidth value={form.cidade} onChange={e => handleChange('cidade', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'uf_end', label: 'Estado (UF)', cols: 2,
                    component: <TextField disabled label="UF" fullWidth value={form.uf} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'compl', label: 'Complemento', cols: 12,
                    component: <TextField label="Complemento" fullWidth value={form.complemento} onChange={e => handleChange('complemento', e.target.value)} InputLabelProps={{ shrink: true }} />
                },
                {
                    key: 'email', label: 'Email', cols: 6,
                    component: <TextField label="Email" fullWidth value={form.email} onChange={e => handleChange('email', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={16} /></InputAdornment> }} />
                },
                {
                    key: 'tel', label: 'Telefone', cols: 6,
                    component: <TextField label="Telefone" fullWidth value={form.telefone} onChange={e => handleChange('telefone', e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Phone size={16} /></InputAdornment> }} />
                }
            ]
        },
        {
            id: 'regras',
            tabIndex: 2, // Pertence à Aba 2
            title: 'Regras de Operação',
            icon: <Settings size={20} />,
            color: 'warning.main',
            fields: [
                {
                    key: 'rec_cego', label: 'Recebimento Cego', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.recebimentoCego} onChange={() => handleSwitchChange('recebimentoCego')} />} label="Recebimento Cego (Ocultar Quantidades da NF)" />
                },
                {
                    key: 'lote', label: 'Controle Lote', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.padraoControlaLote} onChange={() => handleSwitchChange('padraoControlaLote')} />} label="Controla Lote por Padrão" />
                },
                {
                    key: 'validade', label: 'Controle Validade', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.padraoControlaValidade} onChange={() => handleSwitchChange('padraoControlaValidade')} />} label="Controla Validade por Padrão" />
                },
                {
                    key: 'serie', label: 'Controle Série', cols: 12,
                    component: <FormControlLabel control={<Switch checked={form.padraoControlaSerie} onChange={() => handleSwitchChange('padraoControlaSerie')} />} label="Controla Número de Série por Padrão" />
                }
            ]
        }
    ], [form, buscandoCnpj]);

    // --- LÓGICA HÍBRIDA (Busca vs Abas) ---
    const visibleSections = useMemo(() => {
        if (searchTerm) {
            // MODO BUSCA: Ignora abas e traz tudo que combina
            const term = searchTerm.toLowerCase();
            return sections.map(section => ({
                ...section,
                fields: section.fields.filter(f =>
                    f.label.toLowerCase().includes(term) ||
                    section.title.toLowerCase().includes(term)
                )
            })).filter(section => section.fields.length > 0);
        } else {
            // MODO ABA: Traz apenas a seção da aba ativa
            return sections.filter(section => section.tabIndex === activeTab);
        }
    }, [sections, searchTerm, activeTab]);

    return (
        <Box sx={{ width: '100%', pb: 5 }}>

            {/* HEADER FIXO */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box display="flex" alignItems="center" gap={2}>
                    <Button startIcon={<ArrowLeft />} onClick={() => navigate('/cadastros/parceiros')} color="inherit" variant="outlined" sx={{ borderColor: 'divider' }}>
                        Voltar
                    </Button>
                    <Box>
                        <Typography variant="h5" fontWeight="bold">
                            {id ? 'Editar Parceiro' : 'Novo Parceiro'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                            {id ? `Editando: ${form.nome}` : 'Cadastro de cliente ou fornecedor.'}
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

                {/* BARRA DE FERRAMENTAS (BUSCA + ABAS) */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc', px: 2, pt: 2 }}>

                    {/* CAMPO DE BUSCA */}
                    <TextField
                        fullWidth
                        placeholder="Pesquisar campo em qualquer aba (ex: CEP, Lote, CNPJ)..."
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

                    {/* ABAS (Só aparecem se NÃO estiver buscando) */}
                    {!searchTerm && (
                        <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
                            <Tab label="Dados Fiscais" icon={<Briefcase size={18} />} iconPosition="start" />
                            <Tab label="Endereço & Contato" icon={<MapPin size={18} />} iconPosition="start" />
                            <Tab label="Configurações" icon={<Settings size={18} />} iconPosition="start" />
                        </Tabs>
                    )}

                    {searchTerm && (
                        <Typography variant="caption" color="primary" sx={{ mb: 1, display: 'block', fontWeight: 600 }}>
                            Exibindo resultados da pesquisa em todas as seções:
                        </Typography>
                    )}
                </Box>

                {/* CONTEÚDO */}
                <Box sx={{ p: 4, bgcolor: '#fff' }}>
                    <Grid container spacing={3} alignItems="flex-start">
                        {visibleSections.map((section) => (
                            <Grid item xs={12} key={section.title}>
                                <Fade in={true}>
                                    <Paper
                                        variant="outlined"
                                        sx={{
                                            borderRadius: 2,
                                            overflow: 'hidden',
                                            borderLeft: 4,
                                            borderColor: section.color,
                                            boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                                        }}
                                    >
                                        <Box sx={{ p: 2, bgcolor: '#fbfbfb', borderBottom: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                            {section.icon}
                                            <Typography variant="subtitle2" fontWeight="bold" textTransform="uppercase" color="text.primary">
                                                {section.title}
                                            </Typography>
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

export default ParceiroForm;