import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    ClipboardCheck, ArrowLeft, CheckCircle2, Loader2,
    Lock, ShieldAlert, MapPin, Search, ChevronDown, X, Check
} from 'lucide-react';
import { useGetApiCustomers } from '@/api/generated/customers/customers';
import { useGetApiProducts } from '@/api/generated/products/products';
import { useGetApiTopologyLocationsStorage } from '@/api/generated/topology/topology';
import { useGetApiUsers } from '@/api/generated/users/users';
import { customInstance } from '@/api/orval-mutator';
import { toast } from 'sonner';

// 1. SELETOR PESQUISÁVEL DE DEPOSITANTES (USANDO POPOVER PORTAL)
function MultiSearchableCustomerSelect({ selectedIds, onChange, customers }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return customers.slice(0, 40);
        const term = searchTerm.toLowerCase();
        return customers.filter(c =>
            c.corporateName?.toLowerCase().includes(term) ||
            c.cnpj?.includes(term)
        ).slice(0, 40);
    }, [customers, searchTerm]);

    const displayLabel = useMemo(() => {
        if (!selectedIds || selectedIds.length === 0) return "Todos os Depositantes";
        if (selectedIds.length === 1) {
            const found = customers.find(c => c.id === selectedIds[0]);
            return found ? found.corporateName : "1 Depositante Selecionado";
        }
        return `${selectedIds.length} Depositantes Selecionados`;
    }, [selectedIds, customers]);

    const toggleItem = (id) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(i => i !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${selectedIds.length > 0 ? 'border-blue-400 font-bold text-slate-900' : 'border-slate-200 text-slate-600'
                        }`}
                >
                    <span className="truncate">{displayLabel}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                        {selectedIds.length > 0 && (
                            <X
                                size={12}
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange([]);
                                }}
                            />
                        )}
                        <ChevronDown size={14} className="text-slate-400" />
                    </div>
                </button>
            </PopoverTrigger>
            <PopoverContent className="p-2 bg-white border border-slate-200 shadow-xl rounded-lg space-y-2 w-[var(--radix-popover-trigger-width)] z-50" align="start">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar por nome ou CNPJ..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500"
                    />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                    <div
                        onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }}
                        className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between hover:bg-slate-100 ${selectedIds.length === 0 ? 'text-blue-700 font-bold bg-blue-50/50' : 'text-slate-500 italic'
                            }`}
                    >
                        <span>Todos os Depositantes</span>
                        {selectedIds.length === 0 && <Check size={13} className="text-blue-600" />}
                    </div>

                    {filtered.map(cust => {
                        const isSelected = selectedIds.includes(cust.id);
                        return (
                            <div
                                key={cust.id}
                                onClick={() => toggleItem(cust.id)}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                            >
                                <div className="flex flex-col truncate">
                                    <span className="truncate">{cust.corporateName}</span>
                                    <span className="text-[10px] text-slate-400 font-mono">CNPJ: {cust.cnpj}</span>
                                </div>
                                {isSelected && <Check size={13} className="text-blue-600 shrink-0 ml-1" />}
                            </div>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// 2. SELETOR PESQUISÁVEL DE PRODUTOS (USANDO POPOVER PORTAL)
function MultiSearchableProductSelect({ selectedIds, onChange, products }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return products.slice(0, 40);
        const term = searchTerm.toLowerCase();
        return products.filter(p =>
            p.sku?.toLowerCase().includes(term) ||
            p.description?.toLowerCase().includes(term)
        ).slice(0, 40);
    }, [products, searchTerm]);

    const displayLabel = useMemo(() => {
        if (!selectedIds || selectedIds.length === 0) return "Todos os SKUs";
        if (selectedIds.length === 1) {
            const found = products.find(p => p.id === selectedIds[0]);
            return found ? `${found.sku} - ${found.description}` : "1 SKU Selecionado";
        }
        return `${selectedIds.length} SKUs Selecionados`;
    }, [selectedIds, products]);

    const toggleItem = (id) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(i => i !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${selectedIds.length > 0 ? 'border-blue-400 font-bold text-slate-900' : 'border-slate-200 text-slate-600'
                        }`}
                >
                    <span className="truncate font-mono">{displayLabel}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                        {selectedIds.length > 0 && (
                            <X
                                size={12}
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange([]);
                                }}
                            />
                        )}
                        <ChevronDown size={14} className="text-slate-400" />
                    </div>
                </button>
            </PopoverTrigger>
            <PopoverContent className="p-2 bg-white border border-slate-200 shadow-xl rounded-lg space-y-2 w-[var(--radix-popover-trigger-width)] z-50" align="start">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                        type="text"
                        autoFocus
                        placeholder="Buscar por código SKU ou descrição..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                    />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5">
                    <div
                        onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }}
                        className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between hover:bg-slate-100 ${selectedIds.length === 0 ? 'text-blue-700 font-bold bg-blue-50/50' : 'text-slate-500 italic'
                            }`}
                    >
                        <span>Todos os SKUs</span>
                        {selectedIds.length === 0 && <Check size={13} className="text-blue-600" />}
                    </div>

                    {filtered.map(p => {
                        const isSelected = selectedIds.includes(p.id);
                        return (
                            <div
                                key={p.id}
                                onClick={() => toggleItem(p.id)}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                            >
                                <div className="flex flex-col truncate font-mono">
                                    <span className="font-bold">{p.sku}</span>
                                    <span className="text-[10px] text-slate-400 font-sans truncate">{p.description}</span>
                                </div>
                                {isSelected && <Check size={13} className="text-blue-600 shrink-0 ml-1" />}
                            </div>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

// 3. SELETOR PESQUISÁVEL DE POSIÇÕES / ENDEREÇOS (USANDO POPOVER PORTAL)
function MultiSearchableLocationSelect({ selectedIds, onChange, locations }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const filtered = useMemo(() => {
        if (!searchTerm.trim()) return locations.slice(0, 40);
        const term = searchTerm.toLowerCase();
        return locations.filter(l =>
            l.fullPath?.toLowerCase().includes(term) ||
            l.code?.toLowerCase().includes(term)
        ).slice(0, 40);
    }, [locations, searchTerm]);

    const displayLabel = useMemo(() => {
        if (!selectedIds || selectedIds.length === 0) return "Todas as Posições";
        if (selectedIds.length === 1) {
            const found = locations.find(l => l.id === selectedIds[0]);
            return found ? found.fullPath : "1 Posição Selecionada";
        }
        return `${selectedIds.length} Posições Selecionadas`;
    }, [selectedIds, locations]);

    const toggleItem = (id) => {
        if (selectedIds.includes(id)) {
            onChange(selectedIds.filter(i => i !== id));
        } else {
            onChange([...selectedIds, id]);
        }
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={`w-full h-9 px-3 text-xs bg-white border rounded-lg flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${selectedIds.length > 0 ? 'border-blue-400 font-bold text-slate-900 font-mono' : 'border-slate-200 text-slate-600'
                        }`}
                >
                    <span className="truncate">{displayLabel}</span>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                        {selectedIds.length > 0 && (
                            <X
                                size={12}
                                className="text-slate-400 hover:text-rose-600 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChange([]);
                                }}
                            />
                        )}
                        <Search size={14} className="text-slate-400" />
                    </div>
                </button>
            </PopoverTrigger>
            <PopoverContent className="p-2 bg-white border border-slate-200 shadow-xl rounded-lg space-y-2 w-[var(--radix-popover-trigger-width)] z-50" align="start">
                <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                        type="text"
                        autoFocus
                        placeholder="Filtrar endereço..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-500 font-mono"
                    />
                </div>

                <div className="max-h-48 overflow-y-auto space-y-0.5 font-mono">
                    <div
                        onClick={() => { onChange([]); setIsOpen(false); setSearchTerm(''); }}
                        className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between hover:bg-slate-100 ${selectedIds.length === 0 ? 'text-blue-700 font-bold bg-blue-50/50' : 'text-slate-500 italic'
                            }`}
                    >
                        <span>Todas as Posições</span>
                        {selectedIds.length === 0 && <Check size={13} className="text-blue-600" />}
                    </div>

                    {filtered.map(loc => {
                        const isSelected = selectedIds.includes(loc.id);
                        return (
                            <div
                                key={loc.id}
                                onClick={() => toggleItem(loc.id)}
                                className={`px-2.5 py-1.5 rounded text-xs cursor-pointer flex items-center justify-between transition-colors ${isSelected ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-100 text-slate-700'
                                    }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <MapPin size={12} className="text-blue-600 shrink-0" />
                                    <span>{loc.fullPath}</span>
                                </div>
                                {isSelected && <Check size={13} className="text-blue-600 shrink-0 ml-1" />}
                            </div>
                        );
                    })}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export default function NovoInventarioPage() {
    const navigate = useNavigate();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Parâmetros Principais
    const [name, setName] = useState('');
    const [blockMovements, setBlockMovements] = useState(true);
    const [maxRounds, setMaxRounds] = useState('2');
    const [enableAdjustments, setEnableAdjustments] = useState(true);
    const [assignedUserId, setAssignedUserId] = useState('UNASSIGNED');

    // Filtros Múltiplos
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [selectedProductIds, setSelectedProductIds] = useState([]);
    const [selectedLocationIds, setSelectedLocationIds] = useState([]);
    const [batch, setBatch] = useState('');

    // APIs de Apoio
    const { data: customersData } = useGetApiCustomers({ OnlyActive: true, PageSize: 100 });
    const customers = customersData?.items || (Array.isArray(customersData) ? customersData : []);

    const { data: productsData } = useGetApiProducts({ PageSize: 100 });
    const products = productsData?.items || (Array.isArray(productsData) ? productsData : []);

    const { data: locations = [] } = useGetApiTopologyLocationsStorage();

    const { data: usersData } = useGetApiUsers({ PageSize: 100 });
    const users = usersData?.items || (Array.isArray(usersData) ? usersData : []);

    const handleCreatePlan = async (e) => {
        if (e) e.preventDefault();
        if (!name.trim()) return toast.warning('Informe o nome do inventário.');

        setIsSubmitting(true);
        try {
            const payload = {
                name: name.trim(),
                blockMovements,
                maxRounds: Number(maxRounds),
                enableAdjustments,
                assignedUserId: assignedUserId !== 'UNASSIGNED' ? assignedUserId : null,
                customerIds: selectedCustomerIds,
                productIds: selectedProductIds,
                locationIds: selectedLocationIds,
                batch: batch.trim() ? batch.trim() : null
            };

            const res = await customInstance({
                url: '/api/cycle-count/plans',
                method: 'POST',
                data: payload
            });

            toast.success(res?.message || 'Plano de inventário criado em modo Rascunho com sucesso!');
            navigate('/inventario/gestao');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao criar plano de inventário.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
            {/* CABEÇALHO */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" onClick={() => navigate('/inventario/gestao')} className="bg-white">
                        <ArrowLeft size={16} />
                    </Button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <ClipboardCheck className="text-blue-600" size={24} /> Novo Plano de Inventário Cíclico
                        </h1>
                        <p className="text-xs text-slate-500 mt-0.5">Configure as regras, limites de contagem, regras fiscais e posições cobertas.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => navigate('/inventario/gestao')} disabled={isSubmitting}>Cancelar</Button>
                    <Button onClick={handleCreatePlan} disabled={isSubmitting || !name.trim()} className="bg-blue-600 hover:bg-blue-700 text-white font-bold">
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Salvar Plano Rascunho
                    </Button>
                </div>
            </div>

            <form onSubmit={handleCreatePlan} className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* BLOCO 1: CONFIGURAÇÕES GERAIS */}
                <Card className="md:col-span-1 bg-white border-slate-200 shadow-2xs">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold text-slate-900">Parâmetros do Inventário</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Regras de execução e atribuidores.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Nome do Inventário *</Label>
                            <Input
                                placeholder="Ex: Inventário Geral Corredor B - Rodada 1"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="bg-white text-xs border-slate-300"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Limite de Contagens (Rodadas)</Label>
                            <Select value={maxRounds} onValueChange={setMaxRounds}>
                                <SelectTrigger className="bg-white text-xs border-slate-300"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="1">1 Contagem Apenas</SelectItem>
                                    <SelectItem value="2">Até 2 Contagens (Padrão)</SelectItem>
                                    <SelectItem value="3">Até 3 Contagens (Auditoria Estrita)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700">Atribuir Operador Específico</Label>
                            <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                                <SelectTrigger className="bg-white text-xs border-slate-300"><SelectValue placeholder="Livre para qualquer operador" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="UNASSIGNED">Pool Livre (Qualquer Operador)</SelectItem>
                                    {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="pt-2 space-y-4 border-t border-slate-100">
                            {/* BLOQUEAR MOVIMENTAÇÃO */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-bold text-slate-900 flex items-center gap-1">
                                        <Lock size={13} className="text-amber-600" /> Bloquear Movimentações
                                    </Label>
                                    <p className="text-[10px] text-slate-500">Trava movimentações nas posições durante o inventário.</p>
                                </div>
                                <Switch checked={blockMovements} onCheckedChange={setBlockMovements} />
                            </div>

                            {/* MODO AJUSTE VS AUDITORIA */}
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-bold text-slate-900 flex items-center gap-1">
                                        <ShieldAlert size={13} className="text-blue-600" /> Habilitar Ajustes Fiscais
                                    </Label>
                                    <p className="text-[10px] text-slate-500">
                                        {enableAdjustments ? 'Gera solicitações de NF-e para sobras/faltas.' : 'Modo Auditoria: Não gera ajustes fiscais.'}
                                    </p>
                                </div>
                                <Switch checked={enableAdjustments} onCheckedChange={setEnableAdjustments} />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* BLOCO 2 E 3: ESCOPO E FILTROS COM POPOVER FLUTUANTE */}
                <Card className="md:col-span-2 bg-white border-slate-200 shadow-2xs">
                    <CardHeader>
                        <CardTitle className="text-sm font-bold text-slate-900">Escopo e Filtros do Inventário</CardTitle>
                        <CardDescription className="text-xs text-slate-500">Selecione os depositantes, produtos e posições que serão mapeados.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">

                        {/* 1. DEPOSITANTE */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 uppercase">
                                Depositante ({selectedCustomerIds.length === 0 ? 'Todos' : `${selectedCustomerIds.length} selecionados`})
                            </Label>
                            <MultiSearchableCustomerSelect
                                selectedIds={selectedCustomerIds}
                                onChange={setSelectedCustomerIds}
                                customers={customers}
                            />
                            {selectedCustomerIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                    {selectedCustomerIds.map(id => {
                                        const found = customers.find(c => c.id === id);
                                        return found ? (
                                            <Badge key={id} variant="outline" className="bg-slate-50 text-[10px] gap-1 font-sans">
                                                {found.corporateName}
                                                <X size={10} className="cursor-pointer hover:text-rose-600" onClick={() => setSelectedCustomerIds(selectedCustomerIds.filter(i => i !== id))} />
                                            </Badge>
                                        ) : null;
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 2. PRODUTO / SKU */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 uppercase">
                                Produto / SKU ({selectedProductIds.length === 0 ? 'Todos' : `${selectedProductIds.length} selecionados`})
                            </Label>
                            <MultiSearchableProductSelect
                                selectedIds={selectedProductIds}
                                onChange={setSelectedProductIds}
                                products={products}
                            />
                            {selectedProductIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                    {selectedProductIds.map(id => {
                                        const found = products.find(p => p.id === id);
                                        return found ? (
                                            <Badge key={id} variant="outline" className="bg-slate-50 text-[10px] font-mono gap-1">
                                                {found.sku}
                                                <X size={10} className="cursor-pointer hover:text-rose-600 font-sans" onClick={() => setSelectedProductIds(selectedProductIds.filter(i => i !== id))} />
                                            </Badge>
                                        ) : null;
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 3. ENDEREÇO / POSIÇÃO */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-bold text-slate-700 uppercase">
                                Endereço / Posição ({selectedLocationIds.length === 0 ? 'Todas' : `${selectedLocationIds.length} selecionadas`})
                            </Label>
                            <MultiSearchableLocationSelect
                                selectedIds={selectedLocationIds}
                                onChange={setSelectedLocationIds}
                                locations={locations}
                            />
                            {selectedLocationIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1 max-h-24 overflow-y-auto">
                                    {selectedLocationIds.map(id => {
                                        const found = locations.find(l => l.id === id);
                                        return found ? (
                                            <Badge key={id} variant="outline" className="bg-slate-50 text-[10px] font-mono gap-1">
                                                <MapPin size={10} className="text-blue-600" />
                                                {found.fullPath}
                                                <X size={10} className="cursor-pointer hover:text-rose-600 font-sans" onClick={() => setSelectedLocationIds(selectedLocationIds.filter(i => i !== id))} />
                                            </Badge>
                                        ) : null;
                                    })}
                                </div>
                            )}
                        </div>

                        {/* 4. LOTE FÍSICO */}
                        <div className="space-y-1.5 pt-2 border-t border-slate-100">
                            <Label className="text-xs font-bold text-slate-700 uppercase">Lote Físico Específico</Label>
                            <Input
                                placeholder="Digite o código do lote físico se desejar..."
                                value={batch}
                                onChange={(e) => setBatch(e.target.value)}
                                className="bg-white text-xs font-mono border-slate-300"
                            />
                        </div>

                    </CardContent>
                </Card>
            </form>
        </div>
    );
}