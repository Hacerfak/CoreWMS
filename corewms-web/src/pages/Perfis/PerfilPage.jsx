import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { useGetApiRoles, usePostApiRoles, usePutApiRolesId } from '@/api/generated/roles/roles';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Shield, Loader2, Save, CheckSquare, Square } from 'lucide-react';
import { toast } from 'sonner';

// Matriz Completa mapeada de Constants/Permissions.cs
export const MODULE_PERMISSIONS = [
    {
        module: 'Inbound (Recebimento)',
        permissions: [
            { id: 'inbound:view', label: 'Visualizar Ordens de Recebimento e Progresso' },
            { id: 'inbound:import', label: 'Importar XML / Buscar NF-e por Chave de Acesso' },
            { id: 'inbound:manifest', label: 'Manifestar NF-e na SEFAZ (Ciência / Confirmação / Desconhecimento)' },
            { id: 'inbound:review', label: 'Revisar e Vincular Produtos Pendentes de Cadastro' },
            { id: 'inbound:cancel', label: 'Cancelar Ordens Pendentes (Antes do Recebimento)' },
            { id: 'inbound:receive', label: 'Operar Recebimento Físico (Coletor / Doca)' },
            { id: 'inbound:manage', label: 'Gerenciar / Estornar HUs ou Ordem / Importar Legado / Excluir' },
        ]
    },
    {
        module: 'Outbound (Expedição & Packing)',
        permissions: [
            { id: 'outbound:view', label: 'Visualizar Pedidos de Saída, Detalhes e Saldo Disponível' },
            { id: 'outbound:create', label: 'Criar Pedidos Manuais de Retorno / Devolução' },
            { id: 'outbound:import', label: 'Importar Pedidos de Saída via XML da NF-e' },
            { id: 'outbound:edit', label: 'Editar Cabeçalho do Pedido (Antes da Separação)' },
            { id: 'outbound:cancel', label: 'Cancelar Pedidos de Saída' },
            { id: 'outbound:allocate', label: 'Alocar Estoque e Reservar Volumes / Frações' },
            { id: 'outbound:pick', label: 'Executar Separação Física (Picking no Coletor)' },
            { id: 'outbound:pack', label: 'Operar Mesa de Embalagem (Packing)' },
            { id: 'outbound:check', label: 'Executar Conferência Física de Expedição (Checking)' },
            { id: 'outbound:ship', label: 'Confirmar Expedição Física e Baixa de Estoque (Ship)' },
            { id: 'outbound:manage', label: 'Supervisão: Estornar Picking/Conferência/Expedição e Excluir' },
        ]
    },
    {
        module: 'Estoque & Unidades de Manuseio (HUs)',
        permissions: [
            { id: 'inventory:view', label: 'Visualizar Balanço de Estoque, HUs e Extrato Kardex' },
            { id: 'inventory:export', label: 'Exportar Relatórios CSV (Balanço, HUs e Kardex)' },
            { id: 'inventory:move', label: 'Sugestão de Guarda (Putaway) e Movimentação Interna' },
            { id: 'inventory:split', label: 'Realizar Transbordo / Desmembramento de HUs (Split)' },
            { id: 'inventory:merge', label: 'Agrupar / Consolidar Unidades de Manuseio (Merge)' },
            { id: 'inventory:edittraceability', label: 'Editar Rastreabilidade, Lote, Validade, Embalagem e Pesos' },
            { id: 'inventory:manage', label: 'Supervisão: Estornos Diretos de Saldo, Kardex e Reservas' },
        ]
    },
    {
        module: 'Controle de Qualidade',
        permissions: [
            { id: 'quality:view', label: 'Visualizar Ocorrências de Qualidade, Fotos e Histórico' },
            { id: 'quality:hold', label: 'Apontar Avaria, Quarentena, Divergência, Falta ou Sobra' },
            { id: 'quality:release', label: 'Liberar Unidades de Manuseio Bloqueadas (Individual / Lote)' },
            { id: 'quality:manage', label: 'Gerenciar Motivos de Qualidade e Excluir Ocorrências' },
        ]
    },
    {
        module: 'Inventário Cíclico',
        permissions: [
            { id: 'cyclecount:view', label: 'Visualizar Planos de Inventário, Detalhes e Indicador IRA' },
            { id: 'cyclecount:create', label: 'Criar / Solicitar Planos Programados de Inventário' },
            { id: 'cyclecount:export', label: 'Baixar Extratos CSV dos Planos de Inventário' },
            { id: 'cyclecount:count', label: 'Executar Contagens Cegas e Iniciar Contagens Espontâneas' },
            { id: 'cyclecount:manage', label: 'Aprovar Planos, Solicitar Recontagem, Ajustar Saldo e Encerrar' },
        ]
    },
    {
        module: 'Portaria & Controle de Pátio',
        permissions: [
            { id: 'yard:view', label: 'Visualizar Agenda e Dashboard de Pátio / Docas' },
            { id: 'yard:schedule', label: 'Criar Agendamentos Programados (Manual ou via XML)' },
            { id: 'yard:operate', label: 'Operar Portaria (Check-in, Encostar na Doca, Vínculo e Check-out)' },
            { id: 'yard:manage', label: 'Gerenciar Agendamentos (Entrada Direta, Editar, Cancelar e Excluir)' },
        ]
    },
    {
        module: 'Fiscal & SEFAZ',
        permissions: [
            { id: 'fiscal:view', label: 'Consultar NF-es Emitidas, Eventos, DANFE e Baixar XML' },
            { id: 'fiscal:emit', label: 'Emitir NF-e (Saída/Avulsa), CC-e, Cancelar na SEFAZ e Enviar E-mail' },
            { id: 'fiscal:manage', label: 'Gerenciar Naturezas de Operação e Exceções Tributárias' },
        ]
    },
    {
        module: 'Faturamento & Tarifas',
        permissions: [
            { id: 'billing:view', label: 'Visualizar Ciclos de Faturamento e Detalhes das Cobranças' },
            { id: 'billing:export', label: 'Exportar Extrato da Fatura (HTML / Impressão e CSV)' },
            { id: 'billing:manage', label: 'Gerenciar Serviços, Tarifas, Lançamentos Manuais e Fechar Ciclos' },
        ]
    },
    {
        module: 'Cadastros Base (Depositantes & SKUs)',
        permissions: [
            { id: 'customers:view', label: 'Visualizar Clientes / Depositantes' },
            { id: 'customers:create', label: 'Cadastrar Clientes / Depositantes (com Consulta SEFAZ)' },
            { id: 'customers:edit', label: 'Editar / Ativar / Inativar Clientes Depositantes' },
            { id: 'customers:delete', label: 'Excluir / Desativar Clientes Depositantes' },
            { id: 'products:view', label: 'Visualizar Produtos, SKUs e Tipos de Embalagem' },
            { id: 'products:create', label: 'Cadastrar Produtos / SKUs e Tipos de Embalagem' },
            { id: 'products:edit', label: 'Editar Produtos / SKUs e Tipos de Embalagem' },
            { id: 'products:delete', label: 'Excluir Produtos / SKUs e Tipos de Embalagem' },
        ]
    },
    {
        module: 'Logística & Impressão',
        permissions: [
            { id: 'topology:manage', label: 'Gerenciar Armazéns, Zonas e Endereços' },
            { id: 'printing:manage', label: 'Gerenciar Agentes, Impressoras e Etiquetas ZPL' },
        ]
    },
    {
        module: 'Segurança, Empresas & Auditoria',
        permissions: [
            { id: 'users:manage', label: 'Gerenciar Usuários e Vínculos B2B' },
            { id: 'roles:manage', label: 'Gerenciar Perfis de Acesso' },
            { id: 'companies:manage', label: 'Gerenciar Empresas (Multi-Tenant)' },
            { id: 'audit:view', label: 'Consultar Trilha de Auditoria' },
            { id: 'profile:update-self', label: 'Permitir Edição do Próprio Perfil' },
        ]
    }
];

const ALL_PERMISSION_IDS = MODULE_PERMISSIONS.flatMap(m => m.permissions.map(p => p.id));

const roleSchema = z.object({
    name: z.string().min(3, 'O nome do perfil deve ter no mínimo 3 caracteres.'),
    permissions: z.array(z.string()).min(1, 'Selecione pelo menos uma permissão.')
});

export default function PerfilFormPage() {
    const { id } = useParams();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const { data: roles = [], isLoading: isLoadingRoles } = useGetApiRoles();
    const currentRole = isEdit ? roles.find(r => r.id === id) : null;

    const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
        resolver: zodResolver(roleSchema),
        defaultValues: { name: '', permissions: [] }
    });

    const watchedPermissions = watch('permissions') || [];

    useEffect(() => {
        if (isEdit && currentRole) {
            reset({
                name: currentRole.name || '',
                permissions: currentRole.permissions || []
            });
        }
    }, [isEdit, currentRole, reset]);

    const { mutate: createRole, isPending: isCreating } = usePostApiRoles({
        mutation: {
            onSuccess: () => {
                toast.success('Perfil criado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
                navigate('/perfis');
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao criar perfil.')
        }
    });

    const { mutate: updateRole, isPending: isUpdating } = usePutApiRolesId({
        mutation: {
            onSuccess: () => {
                toast.success('Perfil atualizado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
                navigate('/perfis');
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar perfil.')
        }
    });

    const togglePermission = (permId, checked) => {
        const updated = checked
            ? [...watchedPermissions, permId]
            : watchedPermissions.filter(p => p !== permId);
        setValue('permissions', updated, { shouldValidate: true });
    };

    const toggleModulePermissions = (group, checked) => {
        const groupIds = group.permissions.map(p => p.id);
        const updated = checked
            ? [...watchedPermissions, ...groupIds.filter(pid => !watchedPermissions.includes(pid))]
            : watchedPermissions.filter(pid => !groupIds.includes(pid));
        setValue('permissions', updated, { shouldValidate: true });
    };

    const handleSelectAllGlobal = (selectAll) => {
        setValue('permissions', selectAll ? [...ALL_PERMISSION_IDS] : [], { shouldValidate: true });
    };

    const onSubmit = (data) => {
        if (isEdit) {
            updateRole({ id, data });
        } else {
            createRole({ data });
        }
    };

    const isSaving = isCreating || isUpdating;

    if (isEdit && isLoadingRoles) {
        return (
            <div className="h-64 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
        );
    }

    if (isEdit && !isLoadingRoles && !currentRole) {
        return (
            <div className="p-8 text-center space-y-3">
                <p className="text-sm text-slate-500">Perfil de acesso não encontrado.</p>
                <Button variant="outline" onClick={() => navigate('/perfis')}>Voltar para Perfis</Button>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="relative flex flex-col space-y-6 pb-4 animate-in fade-in duration-300">
            {/* CABEÇALHO FIXO DA PÁGINA DEDICADA */}
            <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between bg-white/95 backdrop-blur-xs p-5 border border-slate-200/80 rounded-xl shadow-xs gap-4">
                <div className="flex items-center gap-3">
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => navigate('/perfis')}
                        className="bg-white"
                    >
                        <ArrowLeft size={16} />
                    </Button>
                    <div>
                        <div className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-blue-600" />
                            <h1 className="text-xl font-bold text-slate-900">
                                {isEdit ? `Configurar Perfil: ${currentRole?.name}` : 'Novo Perfil de Acesso'}
                            </h1>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Defina o nome do papel e selecione os privilégios concedidos na operação e no portal web.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/perfis')}
                        disabled={isSaving}
                        className="bg-white h-9 text-xs"
                    >
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        disabled={isSaving}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-9 text-xs min-w-[150px]"
                    >
                        {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                        Salvar Perfil
                    </Button>
                </div>
            </div>

            {/* IDENTIFICAÇÃO DO PERFIL & ATALHOS GLOBAIS */}
            <div className="bg-white p-5 border border-slate-200/80 rounded-xl shadow-xs flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-[260px] max-w-lg">
                    <Label htmlFor="role-name" className="text-xs font-bold uppercase text-slate-700">
                        Nome do Perfil *
                    </Label>
                    <Input
                        id="role-name"
                        placeholder="Ex: Operador de Coletor, Supervisor Logístico, Cliente B2B..."
                        {...register('name')}
                        className={`bg-white h-10 text-sm ${errors.name ? 'border-rose-500' : ''}`}
                    />
                    {errors.name && <p className="text-xs text-rose-600">{errors.name.message}</p>}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-blue-50 text-blue-800 border-blue-200 h-9 px-3 text-xs font-mono">
                        {watchedPermissions.length} de {ALL_PERMISSION_IDS.length} selecionada(s)
                    </Badge>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectAllGlobal(true)}
                        className="h-9 text-xs bg-white"
                    >
                        <CheckSquare size={14} className="mr-1.5 text-emerald-600" /> Marcar Tudo
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSelectAllGlobal(false)}
                        className="h-9 text-xs bg-white"
                    >
                        <Square size={14} className="mr-1.5 text-slate-400" /> Limpar Tudo
                    </Button>
                </div>
            </div>

            {errors.permissions && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold">
                    {errors.permissions.message}
                </div>
            )}

            {/* MATRIZ DE PERMISSÕES POR MÓDULO */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                {MODULE_PERMISSIONS.map((group) => {
                    const groupIds = group.permissions.map(p => p.id);
                    const isAllSelected = groupIds.every(pid => watchedPermissions.includes(pid));

                    return (
                        <div key={group.module} className="bg-white rounded-xl border border-slate-200/80 shadow-2xs flex flex-col">
                            <div className="flex items-center justify-between p-3.5 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                    {group.module}
                                </h3>
                                <label className="relative overflow-hidden flex items-center gap-2 cursor-pointer text-[11px] font-medium text-slate-600">
                                    <span>Marcar módulo</span>
                                    <Checkbox
                                        checked={isAllSelected}
                                        onCheckedChange={(checked) => toggleModulePermissions(group, checked)}
                                    />
                                </label>
                            </div>

                            <div className="p-3 flex flex-col gap-1.5">
                                {group.permissions.map((perm) => {
                                    const isChecked = watchedPermissions.includes(perm.id);
                                    return (
                                        <label
                                            key={perm.id}
                                            className={`relative overflow-hidden flex items-center justify-between gap-3 p-2.5 rounded-lg border text-xs font-medium cursor-pointer transition-all ${isChecked
                                                ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                                                : 'bg-transparent border-transparent text-slate-600 hover:bg-slate-50 hover:border-slate-200'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={(checked) => togglePermission(perm.id, checked)}
                                                />
                                                <span>{perm.label}</span>
                                            </div>
                                            <span className="font-mono text-[10px] text-slate-400">{perm.id}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </form>
    );
}