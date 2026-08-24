import { useState, useContext } from 'react';
import api from '../../services/api';
import { useNavigate, useLocation } from 'react-router-dom'; // <--- Adicionado useLocation
import { AuthContext } from '../../contexts/AuthContext';
import {
    Box, Button, Card, Typography, TextField, CircularProgress,
    Alert, Grid
} from '@mui/material';
import { Upload, Lock, MapPin, ArrowLeft } from 'lucide-react'; // Adicionei ArrowLeft para botão voltar
import { toast } from 'react-toastify';
import SearchableSelect from '../../components/SearchableSelect';

const ESTADOS_BR = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
    'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const UF_OPTIONS = ESTADOS_BR.map(uf => ({ value: uf, label: uf }));

const Onboarding = () => {
    const { refreshUserCompanies } = useContext(AuthContext);
    const [file, setFile] = useState(null);
    const [senha, setSenha] = useState('');
    const [uf, setUf] = useState('SP');
    const [loading, setLoading] = useState(false);
    const [statusMsg, setStatusMsg] = useState('');
    const [error, setError] = useState('');

    const navigate = useNavigate();
    const location = useLocation(); // <--- Hook para ler o estado da navegação

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !senha || !uf) return;

        setLoading(true);
        setError('');
        setStatusMsg('Criando banco de dados e ambiente...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('senha', senha);
        formData.append('uf', uf);

        try {
            await await uploadCertificadoConfig(file, senha, uf);

            setStatusMsg('Finalizando configurações...');

            // Atualiza o contexto global para que o menu do usuário já mostre a nova empresa se necessário
            await refreshUserCompanies();

            toast.success("Ambiente criado com sucesso!");

            // --- LÓGICA DE RETORNO INTELIGENTE ---
            // Se veio da gestão ou seleção, volta para lá. Se não tiver origem, vai para seleção.
            const origin = location.state?.from || '/selecao-empresa';
            navigate(origin);

        } catch (err) {
            console.error("Erro Onboarding:", err);
            let msg = "Erro ao processar certificado.";
            if (err.response?.data) {
                if (typeof err.response.data === 'string') {
                    msg = err.response.data;
                } else if (err.response.data.message) {
                    msg = err.response.data.message;
                }
            }
            setError(msg);
            setStatusMsg('');
        } finally {
            setLoading(false);
        }
    };

    // Botão de Cancelar/Voltar
    const handleCancel = () => {
        const origin = location.state?.from || '/selecao-empresa';
        navigate(origin);
    };

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
            <Card sx={{ maxWidth: 450, width: '100%', p: 4, borderRadius: 2 }}>

                {/* Botão Voltar (Opcional, mas boa prática) */}
                <Button
                    startIcon={<ArrowLeft size={16} />}
                    onClick={handleCancel}
                    sx={{ mb: 2, textTransform: 'none', color: 'text.secondary' }}
                >
                    Voltar
                </Button>

                <Box sx={{ textAlign: 'center', mb: 4 }}>
                    <Typography variant="h4" fontWeight="bold" color="primary.main" gutterBottom>
                        Novo Ambiente
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Envie o certificado A1. O sistema irá consultar a SEFAZ para preencher os dados da empresa automaticamente.
                    </Typography>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                {loading && statusMsg && <Alert severity="info" icon={<CircularProgress size={20} />} sx={{ mb: 3 }}>{statusMsg}</Alert>}

                <form onSubmit={handleSubmit}>

                    {/* SELEÇÃO DE UF */}
                    <Box display="flex" alignItems="center" gap={2} mb={3}>
                        <MapPin size={24} color="#64748b" />
                        <SearchableSelect
                            label="Estado (UF) da Empresa"
                            value={uf}
                            onChange={e => setUf(e.target.value)}
                            options={UF_OPTIONS}
                        />
                    </Box>

                    {/* UPLOAD */}
                    <Box sx={{
                        border: '2px dashed #cbd5e1', borderRadius: 2, p: 4, textAlign: 'center', mb: 3, cursor: 'pointer',
                        bgcolor: '#f8fafc', '&:hover': { bgcolor: '#f1f5f9', borderColor: 'primary.main' }
                    }}>
                        <input
                            type="file"
                            accept=".pfx"
                            id="cert-upload"
                            style={{ display: 'none' }}
                            onChange={(e) => setFile(e.target.files[0])}
                        />
                        <label htmlFor="cert-upload" style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'block' }}>
                            <Upload size={40} color="#64748b" style={{ marginBottom: 10 }} />
                            <Typography variant="body2" color="text.primary" fontWeight="bold">
                                {file ? file.name : "Clique para selecionar o arquivo .pfx"}
                            </Typography>
                        </label>
                    </Box>

                    {/* SENHA */}
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                        <Lock size={20} color="#64748b" style={{ marginRight: 10 }} />
                        <TextField
                            fullWidth
                            label="Senha do Certificado"
                            type="password"
                            value={senha}
                            onChange={(e) => setSenha(e.target.value)}
                        />
                    </Box>

                    <Button
                        fullWidth
                        variant="contained"
                        size="large"
                        type="submit"
                        disabled={loading || !file || !senha || !uf}
                        sx={{ py: 1.5 }}
                    >
                        {loading ? 'Processando...' : 'Criar Ambiente'}
                    </Button>
                </form>
            </Card>
        </Box>
    );
};

export default Onboarding;