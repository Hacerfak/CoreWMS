import { useState, useEffect, useMemo } from 'react';
import {
    Box, TextField, Button, Grid, Paper, Typography, MenuItem,
    CircularProgress, Divider, Chip, Switch, Tabs, Tab,
    InputAdornment, FormControlLabel
} from '@mui/material';
import {
    Save, Search, Upload, ShieldCheck, Mail, Phone,
    CalendarCheck, AlertTriangle, MapPin, Building2, Settings, Globe, Filter
} from 'lucide-react';
import { toast } from 'react-toastify';
import {
    getEmpresaConfig, updateEmpresaConfig,
    consultarCnpjSefaz, uploadCertificadoConfig
} from '../../services/integracaoService';
import { getConfiguracoes, updateConfiguracao } from '../../services/configService';
import SearchableSelect from '../../components/SearchableSelect';
import dayjs from 'dayjs';

const ESTADOS_BR = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
const UF_OPTIONS = ESTADOS_BR.map(uf => ({ value: uf, label: uf }));

const CRT_OPTIONS = [
    { value: '1', label: '1 - Simples Nacional' },
    { value: '2', label: '2 - Simples (Excesso)' },
    { value: '3', label: '3 - Regime Normal' },
    { value: '4', label: '4 - MEI' }
];

const MinhaEmpresa = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [consultando, setConsultando] = useState(false);
    const [searchConfig, setSearchConfig] = useState(''); // Estado da busca de configs

    const [form, setForm] = useState({
        razaoSocial: '', nomeFantasia: '', cnpj: '', inscricaoEstadual: '', inscricaoMunicipal: '', cnaePrincipal: '', regimeTributario: '3',
        email: '', telefone: '', website: '',
        cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: 'SP',
        nomeCertificado: '', validadeCertificado: null
    });

    const [configs, setConfigs] = useState([]);
    const [certFile, setCertFile] = useState(null);
    const [certSenha, setCertSenha] = useState('');
    const [uploadingCert, setUploadingCert] = useState(false);

    useEffect(() => { load(); }, []);

    const load = async () => {
        try {
            const [empresaRes, configRes] = await Promise.all([
                getEmpresaConfig(),
                getConfiguracoes()
            ]);
            setForm(prev => ({ ...prev, ...empresaRes, uf: empresaRes.uf || 'SP' }));
            setConfigs(configRes || []);
        } catch (e) {
            console.error(e);
            toast.error("Erro ao carregar dados.");
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            await updateEmpresaConfig(form);
            const configPromises = configs.map(conf => updateConfiguracao(conf.chave, conf.valor));
            await Promise.all(configPromises);
            toast.success("Dados salvos com sucesso!");
        } catch (e) { toast.error("Erro ao salvar."); }
        finally { setLoading(false); }
    };

    const handleConfigChange = (chave, novoValor) => {
        setConfigs(prev => prev.map(c => c.chave === chave ? { ...c, valor: String(novoValor) } : c));
    };

    const handleUploadCert = async () => {
        if (!certFile || !certSenha) return toast.warning("Informe arquivo e senha.");
        setUploadingCert(true);
        try {
            await uploadCertificadoConfig(certFile, certSenha);
            toast.success("Certificado validado!");
            const up = await getEmpresaConfig();
            setForm(p => ({ ...p, ...up }));
            setCertFile(null); setCertSenha('');
        } catch (e) { toast.error("Erro ao salvar certificado."); } finally { setUploadingCert(false); }
    };

    const handleConsultarSefaz = async () => {
        setConsultando(true);
        try {
            const res = await consultarCnpjSefaz(form.uf, form.cnpj.replace(/\D/g, ''));
            setForm(p => ({ ...p, ...res, uf: res.uf || p.uf }));
            toast.success("Dados da Sefaz aplicados!");
        } catch (e) { toast.error("Erro na consulta Sefaz."); } finally { setConsultando(false); }
    };

    const getCertStatus = () => {
        if (!form.nomeCertificado) return { label: 'Não Configurado', color: 'default', icon: <AlertTriangle size={16} /> };
        const dias = dayjs(form.validadeCertificado).diff(dayjs(), 'day');
        if (dias < 0) return { label: 'Vencido', color: 'error', icon: <AlertTriangle size={16} /> };
        return { label: `Válido até ${dayjs(form.validadeCertificado).format('DD/MM/YYYY')}`, color: 'success', icon: <ShieldCheck size={16} /> };
    };
    const certInfo = getCertStatus();

    // --- LÓGICA DE ORGANIZAÇÃO DAS CONFIGURAÇÕES ---

    // 1. Formata o Label (Snake Case -> Title Case)
    const formatLabel = (k) => k.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());

    // 2. Define a Categoria baseada no Prefixo da Chave
    const getCategory = (chave) => {
        if (chave.startsWith('RECEBIMENTO_')) return 'Recebimento';
        if (chave.startsWith('ESTOQUE_')) return 'Estoque';
        if (chave.startsWith('EXPEDICAO_')) return 'Expedição';
        if (chave.startsWith('PEDIDO_')) return 'Pedidos';
        if (chave.startsWith('AUDITORIA_') || chave.startsWith('SISTEMA_') || chave.startsWith('IMPRESSAO_')) return 'Sistema / Geral';
        return 'Outros';
    };

    // 3. Filtra e Agrupa (Memoizado para performance)
    const groupedConfigs = useMemo(() => {
        const term = searchConfig.toLowerCase();

        // Filtra
        const filtered = configs.filter(c =>
            formatLabel(c.chave).toLowerCase().includes(term) ||
            (c.descricao && c.descricao.toLowerCase().includes(term))
        );

        // Agrupa
        return filtered.reduce((acc, conf) => {
            const cat = getCategory(conf.chave);
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(conf);
            return acc;
        }, {});
    }, [configs, searchConfig]);

    // Ordem de exibição das categorias
    const categoryOrder = ['Recebimento', 'Estoque', 'Expedição', 'Pedidos', 'Sistema / Geral', 'Outros'];

    return (
        <Box sx={{ width: '100%' }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight="bold" color="primary.main">Minha Empresa</Typography>
                    <Typography variant="body2" color="text.secondary">Gerencie identidade e regras do sistema.</Typography>
                </Box>
                <Button variant="contained" startIcon={<Save size={20} />} onClick={handleSave} disabled={loading}>Salvar Tudo</Button>
            </Box>

            <Paper sx={{ width: '100%', mb: 2, borderRadius: 2, overflow: 'hidden' }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', px: 2, bgcolor: '#f8fafc' }}>
                    <Tab label="Dados Cadastrais" icon={<Building2 size={18} />} iconPosition="start" />
                    <Tab label="Endereço" icon={<MapPin size={18} />} iconPosition="start" />
                    <Tab label="Certificado" icon={<ShieldCheck size={18} />} iconPosition="start" />
                    <Tab label="Parâmetros Globais" icon={<Settings size={18} />} iconPosition="start" />
                </Tabs>

                <Box sx={{ p: 4 }}>
                    {/* ABA 0: DADOS */}
                    {activeTab === 0 && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} display="flex" justifyContent="flex-end">
                                <Button variant="outlined" onClick={handleConsultarSefaz} disabled={consultando || !form.cnpj} startIcon={consultando ? <CircularProgress size={16} /> : <Search size={16} />}>Auto-completar via SEFAZ</Button>
                            </Grid>
                            <Grid item xs={12} sm={2}>
                                <SearchableSelect label="UF Sede" value={form.uf || 'SP'} onChange={e => setForm({ ...form, uf: e.target.value })} options={UF_OPTIONS} />
                            </Grid>
                            <Grid item xs={12} sm={4}><TextField label="CNPJ" fullWidth value={form.cnpj} onChange={e => setForm({ ...form, cnpj: e.target.value })} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Razão Social" fullWidth value={form.razaoSocial} onChange={e => setForm({ ...form, razaoSocial: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Nome Fantasia" fullWidth value={form.nomeFantasia} onChange={e => setForm({ ...form, nomeFantasia: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={3}><TextField label="Inscrição Estadual" fullWidth value={form.inscricaoEstadual} onChange={e => setForm({ ...form, inscricaoEstadual: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={3}>
                                <SearchableSelect label="Regime (CRT)" value={form.regimeTributario} onChange={e => setForm({ ...form, regimeTributario: e.target.value })} options={CRT_OPTIONS} />
                            </Grid>
                            <Grid item xs={12} sm={4}><TextField label="CNAE Principal" fullWidth value={form.cnaePrincipal} onChange={e => setForm({ ...form, cnaePrincipal: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={4}><TextField label="Insc. Municipal" fullWidth value={form.inscricaoMunicipal} onChange={e => setForm({ ...form, inscricaoMunicipal: e.target.value })} /></Grid>
                            <Grid item xs={12} sm={4}><TextField label="Website" fullWidth value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><Globe size={16} /></InputAdornment> }} /></Grid>
                        </Grid>
                    )}

                    {/* ABA 1: ENDEREÇO */}
                    {activeTab === 1 && (
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={3}><TextField label="CEP" fullWidth value={form.cep} onChange={e => setForm({ ...form, cep: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={7}><TextField label="Logradouro" fullWidth value={form.logradouro} onChange={e => setForm({ ...form, logradouro: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={2}><TextField label="Número" fullWidth value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={5}><TextField label="Bairro" fullWidth value={form.bairro} onChange={e => setForm({ ...form, bairro: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={5}><TextField label="Cidade" fullWidth value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={2}><TextField disabled label="UF" fullWidth value={form.uf} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12} sm={12}><TextField label="Complemento" fullWidth value={form.complemento} onChange={e => setForm({ ...form, complemento: e.target.value })} InputLabelProps={{ shrink: true }} /></Grid>
                            <Grid item xs={12}><Divider sx={{ borderStyle: 'dashed' }} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Email Comercial" fullWidth value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><Mail size={16} /></InputAdornment> }} /></Grid>
                            <Grid item xs={12} sm={6}><TextField label="Telefone" fullWidth value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} InputProps={{ startAdornment: <InputAdornment position="start"><Phone size={16} /></InputAdornment> }} /></Grid>
                        </Grid>
                    )}

                    {/* ABA 2: CERTIFICADO */}
                    {activeTab === 2 && (
                        <Box maxWidth={600}>
                            <Paper variant="outlined" sx={{ p: 2, mb: 3, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box><Typography variant="caption" color="text.secondary">Arquivo Instalado</Typography><Typography variant="body2" fontWeight={600}>{form.nomeCertificado || 'Não configurado'}</Typography></Box>
                                <Chip label={certInfo.label} color={certInfo.color} icon={certInfo.icon} size="small" />
                            </Paper>
                            <Box display="flex" flexDirection="column" gap={2}>
                                <Button component="label" variant="outlined" fullWidth sx={{ justifyContent: 'flex-start' }}><Upload size={18} style={{ marginRight: 10 }} />{certFile ? certFile.name : "Selecionar .pfx"}<input type="file" hidden accept=".pfx" onChange={e => setCertFile(e.target.files[0])} /></Button>
                                <TextField type="password" size="small" label="Senha" fullWidth value={certSenha} onChange={e => setCertSenha(e.target.value)} />
                                <Box display="flex" justifyContent="flex-end"><Button variant="contained" onClick={handleUploadCert} disabled={uploadingCert}>Enviar</Button></Box>
                            </Box>
                        </Box>
                    )}

                    {/* ABA 3: PARÂMETROS DO SISTEMA (MELHORADA) */}
                    {activeTab === 3 && (
                        <Box>
                            {/* BARRA DE BUSCA DE CONFIGS */}
                            <Box mb={4} maxWidth={500}>
                                <TextField
                                    fullWidth
                                    placeholder="Pesquisar configuração..."
                                    value={searchConfig}
                                    onChange={(e) => setSearchConfig(e.target.value)}
                                    InputProps={{
                                        startAdornment: <InputAdornment position="start"><Filter size={18} color="#94a3b8" /></InputAdornment>
                                    }}
                                    size="small"
                                />
                            </Box>

                            {/* RENDERIZAÇÃO POR CATEGORIA */}
                            {categoryOrder.map(category => {
                                const catConfigs = groupedConfigs[category];
                                if (!catConfigs || catConfigs.length === 0) return null;

                                return (
                                    <Box key={category} mb={4}>
                                        <Typography variant="subtitle2" color="primary" fontWeight="bold" sx={{ textTransform: 'uppercase', mb: 2, letterSpacing: 1 }}>
                                            {category}
                                        </Typography>

                                        <Grid container spacing={2}>
                                            {catConfigs.map((conf) => (
                                                <Grid item xs={12} sm={6} md={4} key={conf.chave}>
                                                    <Paper
                                                        variant="outlined"
                                                        sx={{
                                                            p: 2,
                                                            height: '100%',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            justifyContent: 'space-between',
                                                            borderColor: conf.chave.includes('NEGATIVO') ? 'error.light' : 'divider',
                                                            bgcolor: conf.chave.includes('NEGATIVO') ? '#fff5f5' : 'white',
                                                            transition: '0.2s',
                                                            '&:hover': {
                                                                borderColor: 'primary.main',
                                                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                                            }
                                                        }}
                                                    >
                                                        <Box mb={2}>
                                                            <Typography fontWeight={600} fontSize="0.95rem" gutterBottom color={conf.chave.includes('NEGATIVO') ? 'error.main' : 'text.primary'}>
                                                                {formatLabel(conf.chave)}
                                                            </Typography>
                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.4 }}>
                                                                {conf.descricao}
                                                            </Typography>
                                                        </Box>

                                                        <Box display="flex" justifyContent="flex-end" alignItems="center">
                                                            {conf.tipo === 'BOOLEAN' ? (
                                                                <Switch
                                                                    checked={conf.valor === 'true'}
                                                                    onChange={e => handleConfigChange(conf.chave, e.target.checked)}
                                                                    color={conf.chave.includes('NEGATIVO') ? 'error' : 'primary'}
                                                                />
                                                            ) : conf.tipo === 'INTEGER' ? (
                                                                <TextField
                                                                    type="number"
                                                                    size="small"
                                                                    value={conf.valor}
                                                                    onChange={e => handleConfigChange(conf.chave, e.target.value)}
                                                                    sx={{ width: 100 }}
                                                                />
                                                            ) : (
                                                                <TextField
                                                                    size="small"
                                                                    fullWidth
                                                                    value={conf.valor}
                                                                    onChange={e => handleConfigChange(conf.chave, e.target.value)}
                                                                />
                                                            )}
                                                        </Box>
                                                    </Paper>
                                                </Grid>
                                            ))}
                                        </Grid>
                                    </Box>
                                );
                            })}

                            {Object.keys(groupedConfigs).length === 0 && (
                                <Box textAlign="center" py={4}>
                                    <Typography color="text.secondary">Nenhuma configuração encontrada para "{searchConfig}".</Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                </Box>
            </Paper>
        </Box>
    );
};

export default MinhaEmpresa;