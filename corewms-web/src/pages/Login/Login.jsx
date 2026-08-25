import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Warehouse, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
    const navigate = useNavigate();
    const setTokens = useAuthStore((state) => state.setTokens);

    const [email, setEmail] = useState('master@corewms.com.br');
    const [password, setPassword] = useState('Master@123');
    const [isTransitioning, setIsTransitioning] = useState(false);

    const loginMutation = useMutation({
        mutationFn: async (credentials) => {
            const { data } = await api.post('/api/identity/login', credentials);
            return data;
        },
        onSuccess: (data) => {
            const { accessToken, refreshToken } = data;
            setTokens(accessToken, refreshToken);

            // Inicia a animação de transição moderna
            setIsTransitioning(true);

            // Segura o usu rio na tela de loading por 1.5s para transi o suave
            setTimeout(() => {
                navigate('/selecao-empresa');
            }, 1500);
        },
        onError: (error) => {
            if (error.response?.status === 429) toast.error('Muitas tentativas. Aguarde 1 minuto.');
            else toast.error('Credenciais inválidas ou erro de conexão (CORS).');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        loginMutation.mutate({ email, password });
    };

    // Tela de Loading Fullscreen (A t tica moderna)
    if (isTransitioning) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white animate-in fade-in duration-500">
                <div className="relative flex items-center justify-center mb-8">
                    <div className="absolute inset-0 border-4 border-blue-500/30 rounded-full animate-ping"></div>
                    <div className="bg-blue-600 p-4 rounded-full relative z-10">
                        <Warehouse size={40} className="text-white" />
                    </div>
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">Autenticando</h2>
                <p className="text-slate-400 mt-2 font-mono text-sm">Preparando ambiente logístico seguro...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 animate-in fade-in duration-500">
            <Card className="w-full max-w-sm shadow-xl border-slate-200">
                <CardHeader className="space-y-3 items-center text-center pb-6">
                    <div className="bg-blue-600 p-3 rounded-2xl text-white shadow-md">
                        <Warehouse size={28} />
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-bold tracking-tight text-slate-900">CoreWMS</CardTitle>
                        <CardDescription className="text-slate-500 mt-1">Acesso corporativo</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-700">E-mail</Label>
                            <Input
                                id="email" type="email" required
                                value={email} onChange={(e) => setEmail(e.target.value)}
                                className="bg-slate-50 focus-visible:ring-blue-600"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-700">Senha</Label>
                            <Input
                                id="password" type="password" required
                                value={password} onChange={(e) => setPassword(e.target.value)}
                                className="bg-slate-50 focus-visible:ring-blue-600"
                            />
                        </div>
                        <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white" disabled={loginMutation.isPending}>
                            {loginMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Entrar'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}