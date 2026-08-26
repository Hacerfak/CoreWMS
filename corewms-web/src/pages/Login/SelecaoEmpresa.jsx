import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetApiCompanies } from '@/api/generated/companies/companies';
import { useAuthStore } from '@/store/useAuthStore';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, LogOut, ArrowRight, Plus, Loader2, ShieldCheck } from 'lucide-react';

export default function SelecaoEmpresa() {
    const navigate = useNavigate();
    const { user, setCompanyId, logout, setEmpresas } = useAuthStore();

    // Hook gerado automaticamente pelo Orval
    const { data: companies, isLoading } = useGetApiCompanies();

    useEffect(() => {
        if (companies) {
            setEmpresas(companies);
            if (companies.length === 0 && user?.role === 'ADMIN') {
                navigate('/onboarding', { replace: true });
            }
        }
    }, [companies, navigate, setEmpresas, user]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100/50 flex flex-col">
            <header className="px-8 py-6 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck className="text-blue-600" size={24} />
                    <h1 className="text-xl font-semibold text-slate-900 tracking-tight">Ambiente Seguro</h1>
                </div>
                <Button variant="ghost" onClick={() => { logout(); navigate('/login'); }} className="text-slate-500 hover:text-slate-900">
                    <LogOut className="mr-2 h-4 w-4" /> Encerrar Sessão
                </Button>
            </header>

            <main className="flex-1 flex flex-col items-center justify-center p-6 max-w-6xl mx-auto w-full animate-in fade-in zoom-in-95 duration-500">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold tracking-tight text-slate-900">Selecione o Ambiente</h2>
                    <p className="text-slate-500 mt-3 text-lg">Olá, {user?.nome?.split(' ')[0]}. Qual operação vamos gerenciar hoje?</p>
                </div>

                {isLoading ? (
                    <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                        {companies?.map((empresa) => (
                            <Card
                                key={empresa.id}
                                onClick={() => {
                                    setCompanyId(empresa.id);
                                    navigate('/dashboard');
                                }}
                                className="group relative overflow-hidden cursor-pointer border-slate-200 bg-white hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5 hover:-translate-y-1 transition-all duration-300"
                            >
                                <div className="p-8 flex flex-col h-full">
                                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:text-blue-600 group-hover:bg-blue-50 transition-colors mb-6">
                                        <Building2 size={24} />
                                    </div>
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">{empresa.corporateName}</h3>
                                        <p className="font-mono text-sm text-slate-500 mt-2 tracking-tight">
                                            CNPJ {empresa.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")}
                                        </p>
                                    </div>
                                    <div className="mt-6 flex items-center text-sm font-medium text-slate-400 group-hover:text-blue-600 transition-colors">
                                        Acessar operação <ArrowRight className="ml-2 h-4 w-4 transform group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </Card>
                        ))}

                        {user?.role === 'ADMIN' && (
                            <button
                                onClick={() => navigate('/onboarding')}
                                className="group flex flex-col items-center justify-center h-full min-h-[220px] rounded-xl border-2 border-dashed border-slate-200 bg-transparent hover:border-blue-400 hover:bg-blue-50/50 transition-all duration-300"
                            >
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors mb-4">
                                    <Plus size={24} />
                                </div>
                                <span className="font-medium text-slate-600 group-hover:text-blue-700">Implantar Nova Empresa</span>
                            </button>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}