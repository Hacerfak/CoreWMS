import { useState, useEffect } from 'react';
import {
    Box, Typography, IconButton, Tooltip, CircularProgress,
    List, ListItem, ListItemText, ListItemAvatar, Avatar, Divider
} from '@mui/material';
import { Trash2, Printer, Box as BoxIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import { getLpnsDaSolicitacao, estornarLpn } from '../../../services/recebimentoService';
import ConfirmDialog from '../../../components/ConfirmDialog';
import PrintModal from '../../../components/PrintModal';

const LpnsList = ({ recebimentoId, onUpdate }) => {
    const [lpns, setLpns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [lpnToDelete, setLpnToDelete] = useState(null);
    const [printModalOpen, setPrintModalOpen] = useState(false);
    const [selectedLpnPrint, setSelectedLpnPrint] = useState(null);

    useEffect(() => { loadLpns(); }, [recebimentoId, onUpdate]); // Adicionado onUpdate como dependência

    const loadLpns = async () => {
        setLoading(true);
        try {
            const data = await getLpnsDaSolicitacao(recebimentoId);
            // Ordena pelo ID decrescente (mais recentes primeiro)
            setLpns(data.sort((a, b) => b.id - a.id));
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    const handleConfirmDelete = async () => {
        if (!lpnToDelete) return;
        try {
            await estornarLpn(recebimentoId, lpnToDelete.id);
            toast.success(`LPN ${lpnToDelete.codigo} estornada.`);
            loadLpns();
            if (onUpdate) onUpdate();
        } catch (error) {
            toast.error(error.response?.data?.message || "Erro ao estornar.");
        }
    };

    if (loading) return <Box p={2} display="flex" justifyContent="center"><CircularProgress size={24} /></Box>;
    if (lpns.length === 0) return <Box p={3} textAlign="center" color="text.secondary"><Typography variant="body2">Nenhum volume gerado.</Typography></Box>;

    return (
        <>
            <List dense sx={{ p: 0 }}>
                {lpns.map((lpn, index) => (
                    <Box key={lpn.id}>
                        <ListItem
                            secondaryAction={
                                <Box>
                                    <IconButton size="small" onClick={() => { setSelectedLpnPrint(lpn); setPrintModalOpen(true); }}><Printer size={16} /></IconButton>
                                    <IconButton size="small" color="error" onClick={() => { setLpnToDelete(lpn); setConfirmOpen(true); }}><Trash2 size={16} /></IconButton>
                                </Box>
                            }
                        >
                            <ListItemAvatar>
                                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light', fontSize: '0.75rem' }}>
                                    {lpn.id}
                                </Avatar>
                            </ListItemAvatar>
                            <ListItemText
                                primary={<Typography variant="body2" fontWeight="bold">{lpn.codigo}</Typography>}
                                secondary={
                                    lpn.itens?.map(i => `${i.produto?.sku} (${i.quantidade})`).join(', ')
                                }
                                secondaryTypographyProps={{ noWrap: true, sx: { maxWidth: 200 } }}
                            />
                        </ListItem>
                        {index < lpns.length - 1 && <Divider component="li" />}
                    </Box>
                ))}
            </List>

            <ConfirmDialog open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={handleConfirmDelete} title="Estornar Volume" message="Deseja realmente excluir este volume?" />
            {selectedLpnPrint && <PrintModal open={printModalOpen} onClose={() => setPrintModalOpen(false)} lpnIds={selectedLpnPrint.id} lpnCodigoLabel={selectedLpnPrint.codigo} />}
        </>
    );
};

export default LpnsList;