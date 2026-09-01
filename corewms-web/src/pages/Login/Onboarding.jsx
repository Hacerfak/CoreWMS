import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postApiCompanies } from '@/api/generated/companies/companies';
import { postApiIdentityRefresh } from '@/api/generated/identity/identity';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UploadCloud, Lock, ArrowLeft, Loader2, CheckCircle2, Warehouse, AlertCircle, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

export default function Onboarding() {
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();

    const [file, setFile] = useState(null);
    const [senha, setSenha] = useState('');
    const [uf, setUf] = useState('RS');
    const [errorMsg, setErrorMsg] = useState('');

    const companyMutation = useMutation({
        mutationFn: (data) => postApiCompanies(data),
    });

    const handleLogout = () => {
        queryClient.clear();
        useAuthStore.getState().logout();
        navigate('/login');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!file || !senha) {
            setErrorMsg('Selecione o arquivo do certificado e informe a senha.');
            return;
        }

        companyMutation.mutate(
            {
                certificateFile: file,
                certificatePassword: senha,
                uf: uf,
            },
            {
                onSuccess: async (newCompany) => {
                    toast.success('Empresa configurada com sucesso!');

                    const authStore = useAuthStore.getState();
                    const userEmail = authStore.user?.email || authStore.user?.Email;
                    const currentRefreshToken = authStore.refreshToken;

                    try {
                        if (userEmail && currentRefreshToken) {
                            const res = await postApiIdentityRefresh({
                                email: userEmail,
                                refreshToken: currentRefreshToken
                            });

                            const newAccessToken = res?.accessToken || res?.data?.accessToken;
                            const newRefreshToken = res?.refreshToken || res?.data?.refreshToken;

                            useAuthStore.setState({
                                token: newAccessToken,
                                refreshToken: newRefreshToken,
                                empresas: [
                                    ...authStore.empresas,
                                    {
                                        id: newCompany.id,
                                        cnpj: newCompany.cnpj,
                                        corporateName: newCompany.corporateName
                                    }
                                ]
                            });
                        }
                    } catch (err) {
                        console.warn('A renovação silenciosa falhou, mas a empresa foi criada.', err);
                    }

                    const origin = location.state?.from || '/selecao-empresa';
                    navigate(origin, { replace: true });
                },
                onError: (err) => {
                    const message = err.response?.data?.detail || err.response?.data?.message || 'Erro ao processar certificado digital.';
                    setErrorMsg(message);
                },
            }
        );
    };

    const isPending = companyMutation.isPending;

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 flex items-center justify-center p-6 relative">

            {isPending && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex flex-col items-center justify-center text-white animate-in fade-in duration-300">
                    <div className="bg-slate-900/90 border border-slate-700/80 p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center space-y-4">
                        <div className="relative flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full border-4 border-blue-500/20 border-t-blue-500 animate-spin"></div>
                            <Warehouse className="absolute text-blue-500" size={24} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold tracking-tight text-white">Implantando Ambiente...</h3>
                            <p className="text-xs text-slate-400">Validando certificado A1 e consultando dados fiscais na SEFAZ.</p>
                        </div>
                    </div>
                </div>
            )}

            <Card className="w-full max-w-lg shadow-2xl shadow-slate-200/50 border-slate-200/60 bg-white/80 backdrop-blur-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>

                <CardHeader className="space-y-1 relative pb-6 pt-8 px-8">
                    {/* Botões de Ação no Header */}
                    <div className="absolute left-6 top-6 flex items-center w-[calc(100%-48px)] justify-between">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-slate-900"
                            onClick={() => navigate(location.state?.from || '/selecao-empresa')}
                            disabled={isPending}
                        >
                            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            onClick={handleLogout}
                            disabled={isPending}
                        >
                            <LogOut className="h-4 w-4 mr-2" /> Sair
                        </Button>
                    </div>

                    <div className="text-center mt-8">
                        <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight">Implantação de Ambiente</CardTitle>
                        <CardDescription className="mt-2 text-slate-500 text-sm">
                            Envie o certificado digital A1. Configuraremos os dados fiscais via SEFAZ automaticamente.
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="px-8 pb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">

                        {errorMsg && (
                            <div className="bg-rose-50 border border-rose-200/80 text-rose-700 text-xs p-3 rounded-lg flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
                                <AlertCircle size={16} className="shrink-0 text-rose-500" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label className="text-slate-700">Estado Sede (UF)</Label>
                            <Select value={uf} onValueChange={setUf} disabled={isPending}>
                                <SelectTrigger className="bg-slate-50 focus:ring-blue-600">
                                    <SelectValue placeholder="Selecione o estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ESTADOS_BR.map((estado) => (
                                        <SelectItem key={estado} value={estado}>{estado}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-slate-700">Certificado Digital (.pfx)</Label>
                            <label
                                htmlFor="cert-upload"
                                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ${file ? 'border-blue-400 bg-blue-50/50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100 hover:border-blue-300'
                                    }`}
                            >
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {file ? (
                                        <>
                                            <CheckCircle2 className="w-8 h-8 mb-2 text-blue-600" />
                                            <p className="text-sm font-medium text-blue-900">{file.name}</p>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                                            <p className="text-sm text-slate-600 font-medium">Clique ou arraste o arquivo A1</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    id="cert-upload"
                                    type="file"
                                    accept=".pfx"
                                    disabled={isPending}
                                    className="hidden"
                                    onChange={(e) => setFile(e.target.files[0])}
                                />
                            </label>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="senha" className="text-slate-700">Senha do Certificado</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    id="senha" type="password" required
                                    value={senha} onChange={(e) => setSenha(e.target.value)}
                                    className="pl-9 bg-slate-50 focus-visible:ring-blue-600" placeholder="••••••••"
                                    disabled={isPending}
                                />
                            </div>
                        </div>

                        <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-md mt-4 h-10" disabled={isPending || !file || !senha}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Construir Infraestrutura'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}