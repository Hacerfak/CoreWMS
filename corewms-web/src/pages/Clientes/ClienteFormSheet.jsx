import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Building2, MapPin, Settings2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

const ESTADOS_BR = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const initialFormState = {
    cnpj: '',
    corporateName: '',
    tradeName: '',
    stateRegistration: '',
    municipalRegistration: '',
    crt: 1,
    email: '',
    phone: '',
    zipCode: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    cityName: '',
    state: 'SP',
    cityCode: 0,
    requireBatchControl: false,
    requireExpirationControl: false,
    requireSerialControl: false,
    allowNegativeStock: false,
    autoApproveReceiving: false,
};

export default function ClienteFormSheet({ open, onOpenChange, clienteToEdit = null }) {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState(initialFormState);
    const [activeTab, setActiveTab] = useState('dados-gerais');

    const isEditing = !!clienteToEdit;

    useEffect(() => {
        if (clienteToEdit) {
            setFormData({ ...initialFormState, ...clienteToEdit });
        } else {
            setFormData(initialFormState);
        }
        setActiveTab('dados-gerais');
    }, [clienteToEdit, open]);

    const handleChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // 1. Consulta Automática na SEFAZ via API
    const sefazMutation = useMutation({
        mutationFn: async () => {
            const cleanCnpj = formData.cnpj.replace(/\D/g, '');
            if (cleanCnpj.length !== 14) throw new Error('Digite um CNPJ válido com 14 dígitos.');

            const { data } = await api.post(`/api/customers/consult-sefaz/${cleanCnpj}?uf=${formData.state}`);
            return data;
        },
        onSuccess: (sefazData) => {
            setFormData((prev) => ({
                ...prev,
                corporateName: sefazData.corporateName || prev.corporateName,
                tradeName: sefazData.tradeName || prev.tradeName,
                stateRegistration: sefazData.stateRegistration || prev.stateRegistration,
                crt: sefazData.crt || prev.crt,
                street: sefazData.street || prev.street,
                number: sefazData.number || prev.number,
                complement: sefazData.complement || prev.complement,
                neighborhood: sefazData.neighborhood || prev.neighborhood,
                cityCode: sefazData.cityCode || prev.cityCode,
                cityName: sefazData.cityName || prev.cityName,
                state: sefazData.state || prev.state,
                zipCode: sefazData.zipCode || prev.zipCode,
            }));
            toast.success('Dados importados com sucesso da SEFAZ!');
        },
        onError: (err) => {
            toast.error(err.response?.data?.detail || err.message || 'Erro ao consultar SEFAZ.');
        }
    });

    // 2. Salvar ou Atualizar Cliente
    const saveMutation = useMutation({
        mutationFn: async (payload) => {
            const cleanPayload = {
                ...payload,
                cnpj: payload.cnpj.replace(/\D/g, ''),
                cityCode: Number(payload.cityCode) || 0,
                crt: Number(payload.crt) || 1,
            };

            if (isEditing) {
                return await api.put(`/api/customers/${clienteToEdit.id}`, cleanPayload);
            }
            return await api.post('/api/customers', cleanPayload);
        },
        onSuccess: () => {
            toast.success(isEditing ? 'Cliente atualizado!' : 'Cliente cadastrado com sucesso!');
            queryClient.invalidateQueries({ queryKey: ['clientes'] });
            onOpenChange(false);
        },
        onError: (err) => {
            toast.error(err.response?.data?.message || 'Erro ao salvar cliente.');
        }
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-2xl w-full flex flex-col p-0 bg-white">

                {/* Header do Painel */}
                <SheetHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <SheetTitle className="text-xl font-bold text-slate-900">
                        {isEditing ? 'Editar Cliente Depositante' : 'Novo Cliente Depositante'}
                    </SheetTitle>
                    <SheetDescription className="text-slate-500">
                        {isEditing
                            ? 'Atualize os dados e regras logísticas deste parceiro.'
                            : 'Preencha os dados manuais ou utilize o botão SEFAZ para auto-completar.'}
                    </SheetDescription>
                </SheetHeader>

                {/* Abas Organizadas por Escopo */}
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">

                        <div className="px-6 border-b border-slate-100 bg-white">
                            <TabsList className="bg-transparent h-12 gap-2 p-0">
                                <TabsTrigger value="dados-gerais" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2">
                                    <Building2 size={16} /> Dados Gerais
                                </TabsTrigger>
                                <TabsTrigger value="endereco" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2">
                                    <MapPin size={16} /> Endereço
                                </TabsTrigger>
                                <TabsTrigger value="regras-wms" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2">
                                    <Settings2 size={16} /> Regras WMS
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">

                            {/* ABA 1: DADOS GERAIS */}
                            <TabsContent value="dados-gerais" className="mt-0 space-y-4">
                                <div className="grid grid-cols-3 gap-3 items-end bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                    <div className="col-span-2 space-y-1.5">
                                        <Label htmlFor="cnpj" className="text-slate-700">CNPJ</Label>
                                        <Input
                                            id="cnpj"
                                            placeholder="00.000.000/0000-00"
                                            value={formData.cnpj}
                                            onChange={(e) => handleChange('cnpj', e.target.value)}
                                            disabled={isEditing}
                                            className="bg-white font-mono"
                                        />
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => sefazMutation.mutate()}
                                        disabled={sefazMutation.isPending || isEditing || !formData.cnpj}
                                        className="bg-white hover:bg-blue-600 hover:text-white border-blue-200 text-blue-700 font-medium transition-colors"
                                    >
                                        {sefazMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                        SEFAZ
                                    </Button>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="corporateName">Razão Social *</Label>
                                    <Input
                                        id="corporateName" required
                                        value={formData.corporateName}
                                        onChange={(e) => handleChange('corporateName', e.target.value)}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="tradeName">Nome Fantasia</Label>
                                    <Input
                                        id="tradeName"
                                        value={formData.tradeName || ''}
                                        onChange={(e) => handleChange('tradeName', e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="stateRegistration">Inscrição Estadual (IE)</Label>
                                        <Input
                                            id="stateRegistration"
                                            value={formData.stateRegistration || ''}
                                            onChange={(e) => handleChange('stateRegistration', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="municipalRegistration">Inscrição Municipal (IM)</Label>
                                        <Input
                                            id="municipalRegistration"
                                            value={formData.municipalRegistration || ''}
                                            onChange={(e) => handleChange('municipalRegistration', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="email">E-mail de Contato</Label>
                                        <Input
                                            id="email" type="email"
                                            value={formData.email || ''}
                                            onChange={(e) => handleChange('email', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="phone">Telefone</Label>
                                        <Input
                                            id="phone"
                                            value={formData.phone || ''}
                                            onChange={(e) => handleChange('phone', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* ABA 2: ENDEREÇO */}
                            <TabsContent value="endereco" className="mt-0 space-y-4">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="zipCode">CEP</Label>
                                        <Input
                                            id="zipCode"
                                            value={formData.zipCode || ''}
                                            onChange={(e) => handleChange('zipCode', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="state">Estado (UF)</Label>
                                        <Select value={formData.state} onValueChange={(val) => handleChange('state', val)}>
                                            <SelectTrigger className="bg-white">
                                                <SelectValue placeholder="UF" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {ESTADOS_BR.map((uf) => (
                                                    <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="cityCode">Código IBGE</Label>
                                        <Input
                                            id="cityCode" type="number"
                                            value={formData.cityCode || 0}
                                            onChange={(e) => handleChange('cityCode', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="cityName">Cidade</Label>
                                    <Input
                                        id="cityName"
                                        value={formData.cityName || ''}
                                        onChange={(e) => handleChange('cityName', e.target.value)}
                                    />
                                </div>

                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-3 space-y-1.5">
                                        <Label htmlFor="street">Logradouro / Rua</Label>
                                        <Input
                                            id="street"
                                            value={formData.street || ''}
                                            onChange={(e) => handleChange('street', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="number">Número</Label>
                                        <Input
                                            id="number"
                                            value={formData.number || ''}
                                            onChange={(e) => handleChange('number', e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="neighborhood">Bairro</Label>
                                        <Input
                                            id="neighborhood"
                                            value={formData.neighborhood || ''}
                                            onChange={(e) => handleChange('neighborhood', e.target.value)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="complement">Complemento</Label>
                                        <Input
                                            id="complement"
                                            value={formData.complement || ''}
                                            onChange={(e) => handleChange('complement', e.target.value)}
                                        />
                                    </div>
                                </div>
                            </TabsContent>

                            {/* ABA 3: REGRAS LOGÍSTICAS WMS */}
                            <TabsContent value="regras-wms" className="mt-0 space-y-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-5">

                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Controle de Lote</Label>
                                            <p className="text-xs text-slate-500">Exige informe de Lote na entrada e movimentação de estoque.</p>
                                        </div>
                                        <Switch
                                            checked={formData.requireBatchControl}
                                            onCheckedChange={(val) => handleChange('requireBatchControl', val)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Controle de Data de Validade</Label>
                                            <p className="text-xs text-slate-500">Bloqueia e alerta produtos próximos ao vencimento (FEFO).</p>
                                        </div>
                                        <Switch
                                            checked={formData.requireExpirationControl}
                                            onCheckedChange={(val) => handleChange('requireExpirationControl', val)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Rastreabilidade por Número de Série</Label>
                                            <p className="text-xs text-slate-500">Exige bipe de série individual para cada unidade.</p>
                                        </div>
                                        <Switch
                                            checked={formData.requireSerialControl}
                                            onCheckedChange={(val) => handleChange('requireSerialControl', val)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Permitir Saldo Negativo</Label>
                                            <p className="text-xs text-slate-500">Permite expedição mesmo sem confirmação física no endereço.</p>
                                        </div>
                                        <Switch
                                            checked={formData.allowNegativeStock}
                                            onCheckedChange={(val) => handleChange('allowNegativeStock', val)}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-200 pt-4">
                                        <div className="space-y-0.5">
                                            <Label className="text-base text-slate-900">Aprovação Automática de Recebimento</Label>
                                            <p className="text-xs text-slate-500">Libera o estoque imediatamente após a conferência cega.</p>
                                        </div>
                                        <Switch
                                            checked={formData.autoApproveReceiving}
                                            onCheckedChange={(val) => handleChange('autoApproveReceiving', val)}
                                        />
                                    </div>

                                </div>
                            </TabsContent>

                        </div>

                        {/* Footer do Form */}
                        <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={saveMutation.isPending} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                            </Button>
                        </SheetFooter>

                    </Tabs>
                </form>

            </SheetContent>
        </Sheet>
    );
}