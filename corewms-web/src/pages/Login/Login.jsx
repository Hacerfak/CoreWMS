import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { usePostApiIdentityLogin } from '@/api/generated/identity/identity';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Warehouse, Lock, Mail, Loader2, ArrowRight, AlertCircle } from 'lucide-react';

// 1. Zod Schema espelhando as validações do backend
const loginSchema = z.object({
    email: z.string().min(1, 'O e-mail é obrigatório.').email('Formato de e-mail inválido.'),
    password: z.string().min(1, 'A senha é obrigatória.')
});

export default function Login() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);
    const [errorMsg, setErrorMsg] = useState('');
    const [isRedirecting, setIsRedirecting] = useState(false);

    // 2. Setup do React Hook Form
    const { register, handleSubmit, formState: { errors } } = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: { email: 'master@corewms.com.br', password: '' }
    });

    // 3. Hook gerado pelo Orval
    const { mutate: loginMutation, isPending } = usePostApiIdentityLogin({
        mutation: {
            onSuccess: (loginData) => {
                const token = loginData?.accessToken;
                if (!token) {
                    setIsRedirecting(false);
                    setErrorMsg('Resposta inválida do servidor: token não fornecido.');
                    return;
                }

                setIsRedirecting(true);
                const empresasList = loginData.companies || [];
                const userRole = loginData.role || 'USER';

                setAuth({
                    token,
                    user: {
                        id: loginData.userId,
                        nome: loginData.userName,
                        email: loginData.email,
                        role: userRole,
                    },
                    empresas: empresasList,
                    permissions: [],
                });

                if (empresasList.length === 0 && userRole === 'ADMIN') {
                    navigate('/onboarding', { replace: true });
                } else {
                    navigate('/selecao-empresa', { replace: true });
                }
            },
            onError: (err) => {
                setIsRedirecting(false);
                // Acessa o "detail" vindo do ProblemDetails que mapeamos no GlobalExceptionHandler
                const message = err.response?.data?.detail || err.response?.data?.message || 'E-mail ou senha inválidos.';
                setErrorMsg(message);
            }
        }
    });

    const onSubmit = (data) => {
        setErrorMsg('');
        loginMutation({ data });
    };

    const isLoadingState = isPending || isRedirecting;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 flex flex-col items-center justify-center p-6 relative">

            {isLoadingState && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
                    <div className="bg-slate-900/90 border border-slate-700/80 p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center space-y-4">
                        <div className="relative flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                            <Warehouse className="absolute text-blue-500" size={24} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold tracking-tight text-white">Autenticando...</h3>
                            <p className="text-xs text-slate-400">Sincronizando credenciais e ambiente logístico.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-center gap-2.5 text-blue-600 mb-8">
                <Warehouse size={32} strokeWidth={2.5} />
                <span className="text-2xl font-bold tracking-tight text-slate-900">CoreWMS</span>
            </div>

            <Card className="w-full max-w-md shadow-2xl shadow-slate-200/50 border-slate-200/60 bg-white/80 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>

                <CardHeader className="space-y-1 text-center pb-6 pt-8 px-8">
                    <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight">Acessar Plataforma</CardTitle>
                    <CardDescription className="text-slate-500 text-sm">
                        Entre com suas credenciais para gerenciar a operação.
                    </CardDescription>
                </CardHeader>

                <CardContent className="px-8 pb-8">
                    {/* Alterado para o handleSubmit do RHF */}
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

                        {errorMsg && (
                            <div className="bg-rose-50 border border-rose-200/80 text-rose-700 text-xs p-3 rounded-lg flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
                                <AlertCircle size={16} className="shrink-0 text-rose-500" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-700">E-mail corporativo</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    id="email" type="email" placeholder="nome@empresa.com"
                                    {...register('email')}
                                    className={`pl-9 bg-slate-50 focus-visible:ring-blue-600 ${errors.email ? 'border-rose-500' : ''}`}
                                    disabled={isLoadingState}
                                />
                            </div>
                            {errors.email && <span className="text-xs text-rose-500">{errors.email.message}</span>}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-700">Senha</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    id="password" type="password" placeholder="••••••••"
                                    {...register('password')}
                                    className={`pl-9 bg-slate-50 focus-visible:ring-blue-600 ${errors.password ? 'border-rose-500' : ''}`}
                                    disabled={isLoadingState}
                                />
                            </div>
                            {errors.password && <span className="text-xs text-rose-500">{errors.password.message}</span>}
                        </div>

                        <Button type="submit" disabled={isLoadingState} className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-md mt-2 h-10">
                            {isLoadingState ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <>Entrar na Conta <ArrowRight className="ml-2 h-4 w-4" /></>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}