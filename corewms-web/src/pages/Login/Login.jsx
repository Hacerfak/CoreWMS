import { useState } from 'react';
import { Box, Button, TextField, Typography, Card, CardContent, CircularProgress } from '@mui/material';
import { Warehouse } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuthStore } from '../../store/useAuthStore';

const Login = () => {
    const navigate = useNavigate();
    const setTokens = useAuthStore(state => state.setTokens);

    const [email, setEmail] = useState('master@corewms.com.br');
    const [password, setPassword] = useState('Master@123');

    const loginMutation = useMutation({
        mutationFn: async (credentials) => {
            const { data } = await api.post('/api/identity/login', credentials);
            return data;
        },
        onSuccess: (data) => {
            // CORREÇÃO: Pega 'accessToken' ou 'token' independente de como a API envia
            const token = data.accessToken || data.token;

            if (!token) {
                toast.error("Erro: O backend não retornou um token válido.");
                return;
            }

            // Grava os dados na memória (Zustand + LocalStorage)
            setTokens(token, data.refreshToken);

            toast.success("Login realizado com sucesso!");
            navigate('/selecao-empresa');
        },
        onError: (error) => {
            if (error.response?.status === 429) {
                toast.error("Muitas tentativas. Aguarde 1 minuto.");
            } else {
                toast.error("E-mail ou senha inválidos.");
            }
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        loginMutation.mutate({ email, password });
    };

    return (
        <Box sx={{
            height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)'
        }}>
            <Card sx={{ maxWidth: 400, width: '100%', m: 2, p: 2, borderRadius: 3 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    <Box sx={{ p: 2, bgcolor: 'primary.light', borderRadius: '50%', color: 'white', mb: 1 }}>
                        <Warehouse size={32} />
                    </Box>
                    <Typography variant="h5" fontWeight="bold" color="primary.main">CoreWMS</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>Acesse sua conta para continuar</Typography>

                    <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <TextField
                            label="E-mail" type="email" fullWidth required
                            value={email} onChange={(e) => setEmail(e.target.value)}
                        />
                        <TextField
                            label="Senha" type="password" fullWidth required
                            value={password} onChange={(e) => setPassword(e.target.value)}
                        />
                        <Button variant="contained" size="large" type="submit" fullWidth disabled={loginMutation.isPending}>
                            {loginMutation.isPending ? <CircularProgress size={24} color="inherit" /> : "Entrar"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Login;