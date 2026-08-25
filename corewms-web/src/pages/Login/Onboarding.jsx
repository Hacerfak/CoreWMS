import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { api } from '@/api/client';
import { useAuthStore } from '@/store/useAuthStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UploadCloud, Lock, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'GO', 'PE', 'CE'];

export default function Onboarding() {
    const navigate = useNavigate();
    const location = useLocation();
    const refreshCompanies = useAuthStore((state) => state.refreshUserCompanies);

    const [file, setFile] = useState(null);
    const [senha, setSenha] = useState('');
    const [uf, setUf] = useState('SP');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file || !senha) return toast.warning('Preencha todos os campos.');

        setLoading(true);
        const formData = new FormData();
        formData.append('certificateFile', file);
        formData.append('certificatePassword', senha);
        formData.append('uf', uf);

        try {
            await api.post('/api/companies', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            toast.success('Ambiente logístico criado com sucesso!');
            await refreshCompanies?.();

            const origin = location.state?.from || '/selecao-empresa';
            navigate(origin);
        } catch (error) {
            toast.error(error.response?.data?.message || 'Erro ao processar certificado.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-500">
            <Card className="w-full max-w-lg shadow-2xl shadow-slate-200/50 border-slate-200/60 bg-white/80 backdrop-blur-sm relative overflow-hidden">

                {/* Barra de destaque superior */}
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-600"></div>

                <CardHeader className="space-y-1 relative pb-6 pt-8 px-8">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="absolute left-6 top-6 text-slate-400 hover:text-slate-900"
                        onClick={() => navigate(location.state?.from || '/selecao-empresa')}
                    >
                        <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
                    </Button>
                    <div className="text-center mt-8">
                        <CardTitle className="text-2xl font-bold text-slate-900 tracking-tight">Implantação de Ambiente</CardTitle>
                        <CardDescription className="mt-2 text-slate-500 text-sm">
                            Envie o certificado digital A1. Configuraremos os dados fiscais via SEFAZ automaticamente.
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="px-8 pb-8">
                    <form onSubmit={handleSubmit} className="space-y-6">

                        <div className="space-y-2">
                            <Label className="text-slate-700">Estado Sede (UF)</Label>
                            <Select value={uf} onValueChange={setUf}>
                                <SelectTrigger className="bg-slate-50 focus:ring-blue-600">
                                    <SelectValue placeholder="Selecione o estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    {ESTADOS_BR.map(estado => (
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
                                <input id="cert-upload" type="file" accept=".pfx" className="hidden" onChange={(e) => setFile(e.target.files[0])} />
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
                                />
                            </div>
                        </div>

                        <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-md mt-4" disabled={loading || !file || !senha}>
                            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Construir Infraestrutura'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}