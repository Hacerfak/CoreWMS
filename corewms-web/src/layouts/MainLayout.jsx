import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/useAuthStore';
import { useHasPermission } from '@/hooks/useHasPermission';
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
    const queryClient = useQueryClient();
    const { user, logout, empresas, companyId } = useAuthStore();
    const empresaAtual = empresas?.find(e => e.id === companyId);

    const handleLogout = () => {
        queryClient.clear();
        logout();
        navigate('/login');
    };

    const menuGroups = [
        {
            scope: 'Visão Geral',
            items: [
                { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', permission: null },
            ]
        },
        {
            scope: 'Cadastros',
            items: [
                { icon: Users, label: 'Clientes', path: '/clientes', permission: 'customers:view' },
            ]
        },
        {
            scope: 'Segurança',
            items: [
                { icon: Users, label: 'Usuários', path: '/usuarios', permission: 'users:view' },
                { icon: Shield, label: 'Perfis de Acesso', path: '/perfis', permission: 'roles:manage' },
                { icon: ScrollText, label: 'Auditoria', path: '/auditoria', permission: 'audit:view' },
            ]
        },
        {
            scope: 'Configurações',
            items: [
                { icon: Building2, label: 'Empresas', path: '/empresas', permission: 'companies:view' },
                { icon: Printer, label: 'Impressão', path: '/impressao', permission: 'printing:manage' },
            ]
        }
    ];

    return (
        <div className="flex h-screen w-full bg-slate-50 overflow-hidden text-slate-900 font-sans">
            <aside className="w-72 flex flex-col border-r border-slate-200 bg-slate-50/50 backdrop-blur-xl">
                <div className="h-16 flex items-center px-6 border-b border-slate-200/60">
                    <div className="flex items-center gap-2.5 text-blue-600">
                        <Warehouse size={24} strokeWidth={2.5} />
                        <span className="text-xl font-bold tracking-tight text-slate-900">CoreWMS</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-6 px-4 scrollbar-thin scrollbar-thumb-slate-200">
                    {menuGroups.map((group, index) => {
                        // Filtra apenas itens que o usuário tem permissão para ver
                        const visibleItems = group.items.filter(item => useHasPermission(item.permission));

                        if (visibleItems.length === 0) return null;

                        return (
                            <div key={group.scope} className={index !== 0 ? 'mt-6' : ''}>
                                <h4 className="px-3 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                    {group.scope}
                                </h4>
                                <nav className="space-y-1">
                                    {visibleItems.map((item) => {
                                        const isActive = location.pathname.startsWith(item.path);
                                        return (
                                            <button
                                                key={item.label}
                                                onClick={() => navigate(item.path)}
                                                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                                    ? 'bg-blue-50 text-blue-700 shadow-xs'
                                                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                                                    }`}
                                            >
                                                <item.icon size={19} className={isActive ? 'text-blue-600' : 'text-slate-400'} />
                                                {item.label}
                                            </button>
                                        );
                                    })}
                                </nav>
                            </div>
                        );
                    })}
                </div>
            </aside>

            <main className="flex-1 flex flex-col min-w-0 bg-white">
                <header className="h-16 flex items-center justify-between px-8 border-b border-slate-200/60 bg-white z-10">
                    <div className="flex items-center">
                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200/80 px-3.5 py-1.5 rounded-lg">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                            <span className="text-xs font-semibold text-slate-700 tracking-tight">
                                {empresaAtual?.corporateName || 'Empresa não selecionada'}
                            </span>
                        </div>
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="relative h-9 rounded-full pl-2 pr-4 flex items-center gap-2 hover:bg-slate-50 border border-transparent hover:border-slate-200">
                                <Avatar className="h-7 w-7">
                                    <AvatarFallback className="bg-blue-600 text-white text-xs font-semibold">
                                        {user?.nome?.charAt(0)}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium truncate max-w-[140px]">{user?.nome?.split(' ')[0]}</span>
                                <ChevronDown size={14} className="text-slate-400" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 mt-1">
                            <DropdownMenuLabel className="font-normal p-3">
                                <div className="flex flex-col space-y-1">
                                    <p className="text-sm font-medium text-slate-900 leading-none">{user?.nome}</p>
                                    <p className="text-xs text-slate-500 mt-1">{user?.role === 'ADMIN' ? 'Master' : 'Operacional'}</p>
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

                <div className="flex-1 overflow-auto p-8 bg-slate-50/30 animate-in fade-in duration-500">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}