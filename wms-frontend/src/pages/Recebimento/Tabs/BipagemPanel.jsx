import { useState, useRef, useEffect } from 'react';
import {
    Box, Typography, TextField, Button, Grid, Paper,
    InputAdornment, IconButton, ToggleButton, ToggleButtonGroup,
    Card, CardContent, Divider, List, ListItem, ListItemText, Chip, Alert
} from '@mui/material';
import {
    Barcode, Layers, Box as BoxIcon, CheckCircle, Plus,
    Printer, Lock, Search, X, PackageOpen
} from 'lucide-react';
import { toast } from 'react-toastify';
import { conferirProduto } from '../../../services/recebimentoService';
import { adicionarItemLpn, fecharLpn, gerarLpnVazia, getLpnPorCodigo } from '../../../services/lpnService';

const BipagemPanel = ({ recebimentoId, dadosRecebimento, onSucesso, formatoId, onRequestFormato }) => {
    // --- ESTADOS GLOBAIS ---
    const [modo, setModo] = useState('MASSA'); // 'MASSA' (Produto) ou 'MISTO' (Volume)
    const [sending, setSending] = useState(false);

    // --- REFS (Foco) ---
    const skuRef = useRef(null);
    const lpnRef = useRef(null); // Foco no campo de LPN Alvo (Modo Misto)
    const qtdRef = useRef(null);

    // --- ESTADOS MODO MASSA ---
    const [formMassa, setFormMassa] = useState({ sku: '', qtd: '', volumes: 1 });

    // --- ESTADOS MODO MISTO ---
    const [lpnAtiva, setLpnAtiva] = useState(null); // Objeto LPN { codigo, itens: [] }
    const [lpnInput, setLpnInput] = useState('');
    const [formMisto, setFormMisto] = useState({ sku: '', qtd: '' });

    // Controle de Produto Ativo (Comum aos dois, mas derivado do form ativo)
    const [produtoAtivo, setProdutoAtivo] = useState(null);

    // --- LÓGICA DE MUDANÇA DE MODO ---
    const handleModoChange = (event, newModo) => {
        if (newModo) {
            setModo(newModo);
            setProdutoAtivo(null);
            // Limpa focos e estados
            if (newModo === 'MASSA') setTimeout(() => skuRef.current?.focus(), 100);
            if (newModo === 'MISTO') setTimeout(() => (!lpnAtiva ? lpnRef.current?.focus() : skuRef.current?.focus()), 100);
        }
    };

    // =================================================================================
    // MODO 1: CONFERÊNCIA EM MASSA (Lógica que já existia, refatorada)
    // =================================================================================

    const handleSubmitMassa = async () => {
        if (!formMassa.sku || !formMassa.qtd || !produtoAtivo) return;
        if (!formatoId) { onRequestFormato(); return; }

        setSending(true);
        try {
            await conferirProduto(recebimentoId, formMassa.sku, formMassa.qtd, {
                volumes: formMassa.volumes,
                // Adicione lote/validade aqui se necessário
            }, formatoId);

            toast.success(`Entrada Confirmada: ${formMassa.volumes} vol. de ${produtoAtivo.sku}`);
            setFormMassa({ ...formMassa, sku: '', volumes: 1 }); // Mantém qtd se quiser, ou reseta
            setProdutoAtivo(null);
            if (onSucesso) onSucesso();
            setTimeout(() => skuRef.current?.focus(), 100);
        } catch (error) {
            toast.error("Erro ao conferir.");
        } finally {
            setSending(false);
        }
    };

    // =================================================================================
    // MODO 2: MONTAGEM DE VOLUME MISTO
    // =================================================================================

    // 2.1 Abrir/Buscar LPN
    const handleBuscarLpn = async () => {
        if (!lpnInput) return;
        setSending(true);
        try {
            // Tenta buscar no backend (precisa implementar busca por código)
            // Se não achar e for formato válido, poderia criar. 
            // Por segurança, vamos exigir que exista ou criar via botão "Gerar".
            // Mock temporário:
            setLpnAtiva({ codigo: lpnInput.toUpperCase(), itens: [] });
            toast.info(`Volume ${lpnInput} aberto para montagem.`);
            setTimeout(() => skuRef.current?.focus(), 100);
        } catch (error) {
            toast.error("LPN não encontrada.");
        } finally {
            setSending(false);
        }
    };

    // 2.2 Gerar Nova LPN
    const handleGerarLpn = async () => {
        if (!formatoId) { onRequestFormato(); return; }
        setSending(true);
        try {
            // Passa o recebimentoId (solicitacaoId) aqui
            const [novoCodigo] = await gerarLpnVazia(formatoId, 1, recebimentoId);

            const lpnData = await getLpnPorCodigo(novoCodigo);
            setLpnAtiva(lpnData);
            setLpnInput(novoCodigo);

            toast.success("Nova etiqueta gerada e vinculada!");
            setTimeout(() => skuRef.current?.focus(), 100);
        } catch (error) {
            toast.error("Erro ao gerar LPN.");
        } finally {
            setSending(false);
        }
    };

    // 2.3 Bipar Item na LPN
    const handleAddItem = async () => {
        if (!lpnAtiva || !formMisto.sku || !formMisto.qtd) return;
        setSending(true);
        try {
            await adicionarItemLpn(lpnAtiva.codigo, {
                sku: formMisto.sku,
                quantidade: formMisto.qtd,
                formatoId // Passa caso precise criar on-the-fly (fallback)
            });

            toast.success(`Item adicionado ao volume ${lpnAtiva.codigo}`);

            // Atualiza visualmente a lista de itens da LPN (Ideal: buscar do back atualizado)
            setLpnAtiva(prev => ({
                ...prev,
                itens: [...prev.itens, { sku: formMisto.sku, qtd: formMisto.qtd }]
            }));

            setFormMisto({ sku: '', qtd: '' });
            setProdutoAtivo(null);
            if (onSucesso) onSucesso(); // Atualiza painel geral
            setTimeout(() => skuRef.current?.focus(), 100);

        } catch (error) {
            toast.error("Erro ao adicionar item.");
        } finally {
            setSending(false);
        }
    };

    // 2.4 Fechar Volume
    const handleFecharVolume = async () => {
        if (!lpnAtiva) return;
        if (!window.confirm(`Deseja fechar o volume ${lpnAtiva.codigo}?`)) return;

        try {
            await fecharLpn(lpnAtiva.codigo);
            toast.success("Volume fechado e pronto para armazenagem!");
            setLpnAtiva(null);
            setLpnInput('');
            if (onSucesso) onSucesso();
            setTimeout(() => lpnRef.current?.focus(), 100);
        } catch (error) {
            toast.error("Erro ao fechar volume.");
        }
    };

    // --- EFEITO DE BUSCA DE PRODUTO (Genérico) ---
    useEffect(() => {
        const skuAtual = modo === 'MASSA' ? formMassa.sku : formMisto.sku;
        if (!skuAtual) {
            setProdutoAtivo(null);
            return;
        }

        const termo = skuAtual.toUpperCase();
        const item = dadosRecebimento?.itens?.find(i =>
            i.produto.sku === termo || i.produto.ean13 === termo
        );

        if (item) {
            setProdutoAtivo(item.produto);
            // Auto-preencher quantidade padrão se vazio
            if (modo === 'MASSA' && !formMassa.qtd) setFormMassa(p => ({ ...p, qtd: item.produto.fatorConversao || 1 }));
            if (modo === 'MISTO' && !formMisto.qtd) setFormMisto(p => ({ ...p, qtd: 1 })); // Unitário por padrão no misto
        }
    }, [formMassa.sku, formMisto.sku, dadosRecebimento, modo]);


    return (
        <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid #e2e8f0' }}>

            {/* SELETOR DE MODO */}
            <Box display="flex" justifyContent="center" mb={3}>
                <ToggleButtonGroup
                    value={modo}
                    exclusive
                    onChange={handleModoChange}
                    aria-label="Modo de Conferência"
                    fullWidth
                >
                    <ToggleButton value="MASSA">
                        <Box display="flex" alignItems="center" gap={1}>
                            <Layers size={20} />
                            <Box textAlign="left">
                                <Typography variant="subtitle2" fontWeight="bold">Por Produto (Massa)</Typography>
                                <Typography variant="caption" display="block">Gera LPNs fechadas</Typography>
                            </Box>
                        </Box>
                    </ToggleButton>
                    <ToggleButton value="MISTO">
                        <Box display="flex" alignItems="center" gap={1}>
                            <BoxIcon size={20} />
                            <Box textAlign="left">
                                <Typography variant="subtitle2" fontWeight="bold">Montar Volume (Misto)</Typography>
                                <Typography variant="caption" display="block">Vários itens numa LPN</Typography>
                            </Box>
                        </Box>
                    </ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* CONTEÚDO MODO MASSA */}
            {modo === 'MASSA' && (
                <Grid container spacing={2}>
                    <Grid item xs={12}>
                        <TextField
                            inputRef={skuRef}
                            fullWidth label="Bipar Produto (SKU/EAN)"
                            value={formMassa.sku}
                            onChange={e => setFormMassa({ ...formMassa, sku: e.target.value.toUpperCase() })}
                            onKeyDown={e => e.key === 'Enter' && qtdRef.current?.focus()}
                            InputProps={{ startAdornment: <InputAdornment position="start"><Barcode /></InputAdornment> }}
                            autoFocus
                        />
                    </Grid>
                    {/* ... (Resto dos campos de Qtd e Volumes igual ao atual) ... */}
                    <Grid item xs={6}>
                        <TextField
                            inputRef={qtdRef}
                            fullWidth label="Qtd. por Volume" type="number"
                            value={formMassa.qtd}
                            onChange={e => setFormMassa({ ...formMassa, qtd: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={6}>
                        <TextField
                            fullWidth label="Nº de Volumes" type="number"
                            value={formMassa.volumes}
                            onChange={e => setFormMassa({ ...formMassa, volumes: e.target.value })}
                            onKeyDown={e => e.key === 'Enter' && handleSubmitMassa()}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <Button fullWidth variant="contained" onClick={handleSubmitMassa} disabled={sending}>
                            {sending ? "Processando..." : "Confirmar (Enter)"}
                        </Button>
                    </Grid>
                </Grid>
            )}

            {/* CONTEÚDO MODO MISTO */}
            {modo === 'MISTO' && (
                <Grid container spacing={2}>

                    {/* PASSO 1: IDENTIFICAR LPN ALVO */}
                    <Grid item xs={12}>
                        {!lpnAtiva ? (
                            <Box display="flex" gap={1}>
                                <TextField
                                    inputRef={lpnRef}
                                    fullWidth label="Bipar Etiqueta LPN (Alvo)"
                                    placeholder="LPN-..."
                                    value={lpnInput}
                                    onChange={e => setLpnInput(e.target.value.toUpperCase())}
                                    onKeyDown={e => e.key === 'Enter' && handleBuscarLpn()}
                                    InputProps={{ startAdornment: <InputAdornment position="start"><PackageOpen /></InputAdornment> }}
                                    autoFocus
                                />
                                <Button variant="outlined" onClick={handleGerarLpn} startIcon={<Plus />}>
                                    Gerar
                                </Button>
                            </Box>
                        ) : (
                            <Card variant="outlined" sx={{ bgcolor: '#f0fdf4', borderColor: '#bbf7d0' }}>
                                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                                    <Box display="flex" justifyContent="space-between" alignItems="center">
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <PackageOpen size={20} color="#16a34a" />
                                            <Typography variant="subtitle1" fontWeight="bold">
                                                Volume: {lpnAtiva.codigo}
                                            </Typography>
                                        </Box>
                                        <Button size="small" color="error" onClick={handleFecharVolume} startIcon={<Lock size={16} />}>
                                            Fechar
                                        </Button>
                                    </Box>
                                </CardContent>
                            </Card>
                        )}
                    </Grid>

                    {/* PASSO 2: BIPAR ITENS (Só habilita se tiver LPN Ativa) */}
                    {lpnAtiva && (
                        <>
                            <Grid item xs={8}>
                                <TextField
                                    inputRef={skuRef}
                                    fullWidth label="Produto"
                                    value={formMisto.sku}
                                    onChange={e => setFormMisto({ ...formMisto, sku: e.target.value.toUpperCase() })}
                                    InputProps={{ startAdornment: <InputAdornment position="start"><Barcode /></InputAdornment> }}
                                    autoFocus
                                />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField
                                    fullWidth label="Qtd" type="number"
                                    value={formMisto.qtd}
                                    onChange={e => setFormMisto({ ...formMisto, qtd: e.target.value })}
                                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                                />
                            </Grid>

                            {/* FEEDBACK DO PRODUTO ATIVO */}
                            {produtoAtivo && (
                                <Grid item xs={12}>
                                    <Alert severity="info" icon={<CheckCircle size={20} />}>
                                        {produtoAtivo.nome}
                                    </Alert>
                                </Grid>
                            )}

                            {/* LISTA DE ITENS NA LPN (Feedback Visual) */}
                            <Grid item xs={12}>
                                <Divider sx={{ my: 1 }}>Itens neste volume</Divider>
                                <List dense sx={{ maxHeight: 150, overflow: 'auto', bgcolor: '#f8fafc', borderRadius: 1 }}>
                                    {lpnAtiva.itens.map((it, idx) => (
                                        <ListItem key={idx}>
                                            <ListItemText primary={it.sku} secondary={`Qtd: ${it.qtd}`} />
                                        </ListItem>
                                    ))}
                                    {lpnAtiva.itens.length === 0 && (
                                        <Typography variant="caption" sx={{ p: 2, display: 'block', textAlign: 'center' }}>Volume vazio.</Typography>
                                    )}
                                </List>
                            </Grid>
                        </>
                    )}
                </Grid>
            )}

        </Paper>
    );
};

export default BipagemPanel;