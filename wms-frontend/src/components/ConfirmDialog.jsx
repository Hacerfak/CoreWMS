import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, Box } from '@mui/material';
import { AlertTriangle } from 'lucide-react';

const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmText = "Confirmar", cancelText = "Cancelar", severity = "error" }) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {severity === 'error' && <AlertTriangle color="#dc2626" size={24} />}
                {title}
            </DialogTitle>
            <DialogContent>
                <DialogContentText sx={{ whiteSpace: 'pre-line' }}>
                    {message}
                </DialogContentText>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} color="inherit">
                    {cancelText}
                </Button>
                <Button
                    onClick={() => { onConfirm(); onClose(); }}
                    variant="contained"
                    color={severity}
                    autoFocus
                >
                    {confirmText}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ConfirmDialog;