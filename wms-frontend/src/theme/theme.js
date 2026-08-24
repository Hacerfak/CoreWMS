import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        primary: {
            main: '#2563eb', // blue-600
            light: '#60a5fa', // blue-400
            dark: '#1e40af', // blue-800
            contrastText: '#ffffff',
        },
        secondary: {
            main: '#475569', // slate-600
            light: '#94a3b8', // slate-400
            dark: '#1e293b', // slate-800
            contrastText: '#ffffff',
        },
        background: {
            default: '#f1f5f9', // slate-100
            paper: '#ffffff',
            subtle: '#f8fafc', // slate-50 (Novo: para fundos sutis de menus/tabelas)
        },
        divider: '#e2e8f0', // slate-200 (Novo: Centraliza cor de bordas)
        text: {
            primary: '#0f172a', // slate-900
            secondary: '#64748b', // slate-500
            disabled: '#94a3b8', // slate-400
        },
        success: {
            main: '#16a34a', // green-600
            light: '#dcfce7', // green-100 (fundo de chips)
        },
        warning: {
            main: '#ca8a04', // yellow-600
            light: '#fef9c3', // yellow-100
        },
        error: {
            main: '#dc2626', // red-600
            light: '#fee2e2', // red-100
        },
    },
    typography: {
        fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
        h4: { fontWeight: 700 },
        h5: { fontWeight: 600 },
        h6: { fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600 },
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: { borderRadius: 8, boxShadow: 'none', '&:hover': { boxShadow: 'none' } },
                contained: { '&:hover': { boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' } }
            },
        },
        MuiPaper: {
            defaultProps: { elevation: 0 },
            styleOverrides: {
                root: { border: '1px solid #e2e8f0' } // Usa a mesma cor do divider, mas hardcoded aqui pq o tema está sendo criado
            }
        },
        MuiTextField: { defaultProps: { size: 'small' } },
        MuiSelect: { defaultProps: { size: 'small' } },
        MuiCard: { styleOverrides: { root: { borderRadius: 12 } } },
    },
});

export default theme;