import { Box, LinearProgress, Typography, Chip, Alert } from '@mui/material';
import { CheckCircle } from 'lucide-react';

const ProgressoConferencia = ({ previsto, conferido, cego }) => {
    if (cego) return <Alert severity="info" sx={{ py: 0 }}>Modo Cego: Progresso oculto.</Alert>;

    const percentual = previsto > 0 ? (conferido / previsto) * 100 : 0;
    const isCompleto = percentual >= 100;

    return (
        <Box display="flex" alignItems="center" gap={2} bgcolor="#f8fafc" p={2} borderRadius={2} border="1px solid #e2e8f0">
            <Box flex={1}>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" fontWeight="bold">Progresso Geral</Typography>
                    <Typography variant="caption" fontWeight="bold">
                        {conferido} / {previsto} ({Math.round(percentual)}%)
                    </Typography>
                </Box>
                <LinearProgress
                    variant="determinate" value={Math.min(percentual, 100)}
                    color={isCompleto ? "success" : "primary"} sx={{ height: 8, borderRadius: 4 }}
                />
            </Box>
            {isCompleto && <Chip label="Completo" color="success" size="small" icon={<CheckCircle size={14} />} />}
        </Box>
    );
};
export default ProgressoConferencia;