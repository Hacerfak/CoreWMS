import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';
import {
    Warehouse, LayoutDashboard, Users, Shield, Building2,
    Printer, ScrollText, LogOut, ChevronDown
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

export default function MainLayout() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, empresas, companyId } = useAuthStore();
    const empresaAtual = empresas?.find(e => e.id === companyId);

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    // Estrutura agrupada por escopos (Mapeamento da API)
    const menuGroups = [
        {
            scope: 'Visão Geral',
            items: [
                { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
            ]
        },
        {
            scope: 'Cadastros Base',
            items: [
                { icon: Users, label: 'Clientes', path: '/clientes' },
            ]
        },
        {
            scope: 'Segurança',
            items: [
                { icon: Users, label: 'Usuários', path: '/usuarios' },
                { icon: Shield, label: 'Perfis de Acesso', path: '/perfis' },
            ]
        },
        {
            scope: 'Configurações',
            items: [
                { icon: Building2, label: 'Empresas', path: '/empresas' },
                { icon: Printer, label: 'Impressão', path: '/impressao' },
                { icon: ScrollText, label: 'Auditoria', path: '/auditoria' },
            ]
        }
    ];

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-900 font-sans">

            {/* Sidebar Elegante com Agrupamentos */}
            <aside className="w-64 flex flex-col border-r border-slate-200 bg-slate-50/50 backdrop-blur-xl">
                <div className="h-16 flex items-center px-6 border-b border-slate-200/60">
                    <div className="flex items-center gap-2 text-blue-600">
                        <Warehouse size={22} strokeWidth={2.5} />
                        <span className="text-lg font-bold tracking-tight text-slate-900">CoreWMS</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-6 px-4 scrollbar-thin scrollbar-thumb-slate-200">
                    {menuGroups.map((group, index) => (
                        <div key={group.scope} className={index !== 0 ? 'mt-6' : ''}>
                            <h4 className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                {group.scope}
                            </h4>
                            <nav className="space-y-1">
                                {group.items.map((item) => {
                                    const isActive = location.pathname.startsWith(item.path);
                                    return (
                                        <button
                                            key={item.label}
                                            onClick={() => navigate(item.path)}
                                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${isActive
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                                }`}
                                        >
                                            <item.icon size={18} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                                            {item.label}
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>
                    ))}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 bg-white">

                {/* Header Minimalista */}
                <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200/60 bg-white z-10">
                    <div className="flex items-center">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-md">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-xs font-medium text-slate-600 tracking-tight">
                                {empresaAtual?.corporateName || 'Empresa não selecionada'}
                            </span>
                        </div>
                    </div>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative h-9 rounded-full pl-2 pr-4 flex items-center gap-2 hover:bg-slate-50 border border-transparent hover:border-slate-200">
                                <Avatar className="h-6 w-6">
                                    <AvatarFallback className="bg-blue-600 text-white text-xs font-medium">
                                        {user?.nome?.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium truncate max-w-[120px]">{user?.nome?.split(' ')[0]}</span>
                                <ChevronDown size={14} className="text-slate-400" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 mt-1">
                            <DropdownMenuLabel className="font-normal p-3">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium text-slate-900 leading-none">{user?.nome}</p>
                                    <p className="text-xs text-slate-500 mt-1">{user?.role}</p>
                                </div>
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => navigate('/selecao-empresa')} className="cursor-pointer py-2">
                                <Warehouse className="mr-2 h-4 w-4 text-slate-400" /> Trocar Operação
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer py-2 text-red-600 focus:text-red-600 focus:bg-red-50">
                                <LogOut className="mr-2 h-4 w-4" /> Encerrar Sessão
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>

                {/* Dynamic Content */}
                <div className="flex-1 overflow-auto p-8 bg-slate-50/30 animate-in fade-in duration-500">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}