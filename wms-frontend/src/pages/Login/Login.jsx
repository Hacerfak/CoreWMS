import { useState, useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';
import { Box, Button, TextField, Typography, Card, CardContent, CircularProgress } from '@mui/material';
import { Warehouse } from 'lucide-react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

const Login = () => {
    const { login } = useContext(AuthContext);
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: 'master@corewms.com.br', password: 'Master@123' });
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            const { empresas } = await login(form.email, form.password);
            toast.success("Login realizado com sucesso!");

            // Regra: Se existirem empresas cadastradas, vai direto para a Seleção
            if (empresas && empresas.length > 0) {
                navigate('/selecao-empresa');
            } else {
                // Onboarding acionado APENAS se o banco não possuir nenhuma empresa
                navigate('/onboarding');
            }
        } catch (error) {
            if (error.response?.status === 429) {

                toast.error("Muitas tentativas de login. Aguarde 1 minuto e tente novamente.");
            } else {
                toast.error("E-mail ou senha inválidos.");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box sx={{
            height: '100vh',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, #1e40af 0%, #2563eb 100%)'
        }}>
            <Card sx={{ maxWidth: 400, width: '100%', m: 2, p: 2, borderRadius: 3 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
                    <Box sx={{ p: 2, bgcolor: 'primary.light', borderRadius: '50%', color: 'white', mb: 1 }}>
                        <Warehouse size={32} />
                    </Box>
                    <Typography variant="h5" fontWeight="bold" color="primary.main">
                        CoreWMS
                    </Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Acesse sua conta para continuar
                    </Typography>
                    <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <TextField
                            label="E-mail"
                            type="email"
                            fullWidth
                            required
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                        <TextField
                            label="Senha"
                            type="password"
                            fullWidth
                            required
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                        <Button variant="contained" size="large" type="submit" fullWidth disabled={isLoading}>
                            {isLoading ? <CircularProgress size={24} color="inherit" /> : "Entrar"}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
};

export default Login;