import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, LinearProgress, IconButton, Tooltip, Paper, Chip, Grid
} from '@mui/material';
import {
    ArrowLeft, CheckCircle, FileText, Anchor, Container, RotateCcw
} from 'lucide-react';
import { toast } from 'react-toastify';
import { getRecebimentoById, getProgressoRecebimento, resetarConferencia } from '../../services/recebimentoService';
import { checkExibirQtdRecebimento } from '../../services/configService';
import ConfirmDialog from '../../components/ConfirmDialog';
import BipagemPanel from './Tabs/BipagemPanel';
import LpnsList from './Tabs/LpnsList';
import ProgressoConferencia from './Components/ProgressoConferencia';
import ModalSelecaoFormato from '../../components/Operacao/ModalSelecaoFormato';
import FinalizarConferenciaModal from './Components/FinalizarConferenciaModal'; // <--- Import Novo

const Conferencia = () => {
    const { id } = useParams();
    const navigate = useNavigate();

    const [recebimento, setRecebimento] = useState(null);
    const [progressoData, setProgressoData] = useState({ totalPrevisto: 0, totalConferido: 0 });
    const [loading, setLoading] = useState(true);
    const [exibirQtdEsperada, setExibirQtdEsperada] = useState(true);

    // Modais
    const [modalFormatoOpen, setModalFormatoOpen] = useState(false);
    const [modalFinalizarOpen, setModalFinalizarOpen] = useState(false); // <--- Estado do Modal Finalizar
    const [formatoSelecionado, setFormatoSelecionado] = useState(null);

    // Controle de Confirmação (Reset)
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmData, setConfirmData] = useState({});

    useEffect(() => { init(); }, [id]);

    const init = async () => {
        try {
            const [recData, configCega] = await Promise.all([
                getRecebimentoById(id),
                checkExibirQtdRecebimento(id)
            ]);
            setRecebimento(recData);
            setExibirQtdEsperada(configCega);
            await atualizarProgresso();
        } catch (e) {
            toast.error("Erro ao carregar conferência.");
            navigate('/recebimento/tarefas');
        } finally {
            setLoading(false);
        }
    };

    const atualizarProgresso = async () => {
        try {
            const data = await getProgressoRecebimento(id);
            setProgressoData(data);
            // Atualiza status se mudou
            const rec = await getRecebimentoById(id);
            setRecebimento(rec);
        } catch (e) { console.error(e); }
    };

    const handleFormatoSelect = (id) => {
        setFormatoSelecionado(id);
        setModalFormatoOpen(false);
        toast.info("Formato definido.");
    };

    // Handler do Reset
    const handleReiniciarClick = () => {
        setConfirmData({
            title: "Reiniciar Conferência",
            message: "ATENÇÃO: Isso apagará todas as contagens e estornará os estoques desta nota. Deseja continuar?",
            severity: "error",
            action: async () => {
                setLoading(true);
                try {
                    await resetarConferencia(id);
                    toast.success("Reiniciado com sucesso!");
                    window.location.reload();
                } catch (error) {
                    toast.error(error.response?.data?.message || "Erro ao reiniciar.");
                    setLoading(false);
                }
            }
        });
        setConfirmOpen(true);
    };

    // Callback de Sucesso da Finalização
    const onFinalizacaoSucesso = () => {
        navigate('/recebimento/lista');
    };

    const handleSair = () => navigate('/recebimento/tarefas');

    if (loading) return <LinearProgress sx={{ height: 6 }} />;

    return (
        <Box sx={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', bgcolor: '#f8fafc', p: 2, gap: 2 }}>

            {/* HEADER */}
            <Paper elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #e2e8f0', borderRadius: 2 }}>
                <Box display="flex" alignItems="center" gap={3}>
                    <IconButton onClick={handleSair} size="small"><ArrowLeft /></IconButton>
                    <Box>
                        <Typography variant="h6" fontWeight="800" lineHeight={1}>
                            {recebimento?.fornecedor?.nome}
                        </Typography>
                        <Box display="flex" gap={2} mt={0.5} color="text.secondary">
                            <Typography variant="caption" display="flex" alignItems="center" gap={0.5}>
                                <FileText size={14} /> NF: {recebimento?.notaFiscal}
                            </Typography>
                            <Typography variant="caption" display="flex" alignItems="center" gap={0.5}>
                                <Anchor size={14} /> {recebimento?.doca?.codigo || 'Sem Doca'}
                            </Typography>
                        </Box>
                    </Box>
                </Box>

                {/* Painel Central: Formato e Progresso */}
                <Box display="flex" alignItems="center" gap={2}>
                    <Button
                        variant={formatoSelecionado ? "outlined" : "contained"}
                        color={formatoSelecionado ? "primary" : "warning"}
                        size="small"
                        onClick={() => setModalFormatoOpen(true)}
                        startIcon={<Container size={16} />}
                    >
                        {formatoSelecionado ? "Alterar Formato" : "Selecionar Formato"}
                    </Button>

                    <Box width={250}>
                        <ProgressoConferencia
                            previsto={progressoData.totalPrevisto}
                            conferido={progressoData.totalConferido}
                            cego={!exibirQtdEsperada}
                        />
                    </Box>
                </Box>

                {/* Botões Finais */}
                <Box display="flex" gap={1}>
                    <Tooltip title="Zerar e Recomeçar">
                        <Button
                            color="error"
                            variant="outlined"
                            onClick={handleReiniciarClick}
                            sx={{ minWidth: 40, px: 1 }}
                        >
                            <RotateCcw size={18} />
                        </Button>
                    </Tooltip>

                    <Button
                        variant="contained"
                        color="success"
                        onClick={() => setModalFinalizarOpen(true)} // <--- Abre o Modal
                        startIcon={<CheckCircle />}
                        sx={{ px: 3, fontWeight: 'bold' }}
                    >
                        Finalizar
                    </Button>
                </Box>
            </Paper>

            {/* ÁREA DE TRABALHO */}
            <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden' }}>
                <Grid item xs={12} md={8} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <BipagemPanel
                        recebimentoId={id}
                        dadosRecebimento={recebimento}
                        onSucesso={atualizarProgresso}
                        formatoId={formatoSelecionado}
                        onRequestFormato={() => setModalFormatoOpen(true)}
                    />
                    <Box sx={{ mt: 2, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="subtitle2" fontWeight="bold" mb={1} color="text.secondary">
                            Volumes Gerados Recentemente
                        </Typography>
                        <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto', borderRadius: 2, bgcolor: 'white' }}>
                            <LpnsList recebimentoId={id} onUpdate={atualizarProgresso} />
                        </Paper>
                    </Box>
                </Grid>

                <Grid item xs={12} md={4} sx={{ height: '100%', overflow: 'hidden' }}>
                    {/* Lista Lateral de Itens (Mantida igual ao código anterior, omiti para brevidade) */}
                    <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2, bgcolor: 'white' }}>
                        {/* ... Código da lista de itens ... */}
                        {/* Se precisar, posso reenviar este bloco completo, mas ele não mudou */}
                        <Box p={2} borderBottom="1px solid #e2e8f0" bgcolor="#f1f5f9">
                            <Typography variant="subtitle2" fontWeight="bold">Resumo da Nota</Typography>
                        </Box>
                        <Box sx={{ flex: 1, overflowY: 'auto' }}>
                            {/* Loop dos itens do recebimento */}
                            {recebimento?.itens?.map(item => (
                                <Box key={item.id} p={2} borderBottom="1px solid #eee">
                                    <Typography variant="body2" fontWeight="bold">{item.produto.sku}</Typography>
                                    <Typography variant="caption">{item.produto.nome}</Typography>
                                    <Box display="flex" justifyContent="space-between" mt={1}>
                                        <Chip label={`${item.quantidadeConferida} / ${exibirQtdEsperada ? item.quantidadePrevista : '?'}`} size="small" />
                                    </Box>
                                </Box>
                            ))}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* MODAIS */}
            <ModalSelecaoFormato
                open={modalFormatoOpen}
                onClose={() => setModalFormatoOpen(false)}
                onSelect={handleFormatoSelect}
            />

            <FinalizarConferenciaModal
                open={modalFinalizarOpen}
                onClose={() => setModalFinalizarOpen(false)}
                recebimentoId={id}
                onSucesso={onFinalizacaoSucesso}
            />

            <ConfirmDialog
                open={confirmOpen} onClose={() => setConfirmOpen(false)}
                onConfirm={confirmData.action} title={confirmData.title}
                message={confirmData.message} severity={confirmData.severity}
            />
        </Box>
    );
};

export default Conferencia;