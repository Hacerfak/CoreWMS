import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { customInstance } from '@/api/orval-mutator';
import {
    usePutApiCompaniesId,
    usePutApiCompaniesIdCertificate,
    usePostApiCompaniesIdSyncSefaz
} from '@/api/generated/companies/companies';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
    Loader2, Building2, Save, FileKey2, UploadCloud, AlertCircle, Sparkles,
    MapPin, FileSignature, ShieldCheck, FileText, Truck, Image as ImageIcon,
    X, Mail, Send, Server, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';

const empresaSchema = z.object({
    corporateName: z.string().min(3, 'Razão Social obrigatória.'),
    tradeName: z.string().optional(),
    stateRegistration: z.string().optional(),
    municipalRegistration: z.string().optional(),
    cnae: z.string().optional(),
    crt: z.coerce.number().optional().nullable(),
    environment: z.coerce.number().default(2),
    nfeSerie: z.coerce.number().min(1, 'Série deve ser maior que 0.').default(1),
    nfeNextNumber: z.coerce.number().min(1, 'Número deve ser maior que 0.').default(1),
    rntrc: z.string().optional(),
    iest: z.string().optional(),
    email: z.string().email('E-mail inválido.').or(z.literal('')).optional(),
    phone: z.string().optional(),
    zipCode: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().optional(),
    neighborhood: z.string().optional(),
    cityName: z.string().optional(),
    cityCode: z.coerce.number().optional().nullable(),
    state: z.string().length(2, 'UF requer 2 letras.'),
    logoBase64: z.string().optional().nullable(),

    // Configurações de E-mail
    emailProvider: z.coerce.number().default(0),
    emailSenderName: z.string().optional().nullable(),
    emailSenderAddress: z.string().optional().nullable(),
    smtpHost: z.string().optional().nullable(),
    smtpPort: z.coerce.number().optional().nullable(),
    smtpUser: z.string().optional().nullable(),
    smtpPassword: z.string().optional().nullable(),
    smtpEnableSsl: z.boolean().default(true)
});

const certSchema = z.object({
    certificateFile: z.any().refine((files) => files?.length === 1, 'Selecione o arquivo PFX.'),
    password: z.string().min(1, 'A senha é obrigatória.')
});

export default function EmpresaFormModal({ open, onOpenChange, empresaToEdit }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('dados');

    const [testEmailDestination, setTestEmailDestination] = useState('');
    const [isTestingEmail, setIsTestingEmail] = useState(false);

    const {
        register: regDados,
        handleSubmit: submitDados,
        setValue: setDadosValue,
        reset: resetDados,
        watch: watchDados,
        formState: { errors: errDados }
    } = useForm({
        resolver: zodResolver(empresaSchema),
        defaultValues: {
            environment: 2,
            nfeSerie: 1,
            nfeNextNumber: 1,
            emailProvider: 0,
            smtpPort: 587,
            smtpEnableSsl: true
        }
    });

    const {
        register: regCert,
        handleSubmit: submitCert,
        reset: resetCert,
        formState: { errors: errCert }
    } = useForm({
        resolver: zodResolver(certSchema)
    });

    const logoBase64 = watchDados('logoBase64');
    const emailProvider = Number(watchDados('emailProvider') ?? 0);

    useEffect(() => {
        if (open && empresaToEdit) {
            resetDados({
                corporateName: empresaToEdit.corporateName || '',
                tradeName: empresaToEdit.tradeName || '',
                stateRegistration: empresaToEdit.stateRegistration || '',
                municipalRegistration: empresaToEdit.municipalRegistration || '',
                cnae: empresaToEdit.cnae || '',
                crt: empresaToEdit.crt || 1,
                environment: empresaToEdit.environment ?? 2,
                nfeSerie: empresaToEdit.nfeSerie || 1,
                nfeNextNumber: empresaToEdit.nfeNextNumber || 1,
                rntrc: empresaToEdit.rntrc || '',
                iest: empresaToEdit.iest || '',
                email: empresaToEdit.email || '',
                phone: empresaToEdit.phone || '',
                zipCode: empresaToEdit.zipCode || '',
                street: empresaToEdit.street || '',
                number: empresaToEdit.number || '',
                complement: empresaToEdit.complement || '',
                neighborhood: empresaToEdit.neighborhood || '',
                cityName: empresaToEdit.cityName || '',
                cityCode: empresaToEdit.cityCode || 0,
                state: empresaToEdit.state || '',
                logoBase64: empresaToEdit.logoBase64 || null,

                emailProvider: empresaToEdit.emailProvider ?? 0,
                emailSenderName: empresaToEdit.emailSenderName || '',
                emailSenderAddress: empresaToEdit.emailSenderAddress || '',
                smtpHost: empresaToEdit.smtpHost || '',
                smtpPort: empresaToEdit.smtpPort || 587,
                smtpUser: empresaToEdit.smtpUser || '',
                smtpPassword: '',
                smtpEnableSsl: empresaToEdit.smtpEnableSsl ?? true
            });
            resetCert();
            setTestEmailDestination(empresaToEdit.email || '');
            setActiveTab('dados');
        }
    }, [open, empresaToEdit, resetDados, resetCert]);

    const handleLogoUpload = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            toast.error('O arquivo da logomarca deve ter no máximo 2MB.');
            return;
        }
        const reader = new FileReader();
        reader.onloadend = () => {
            setDadosValue('logoBase64', reader.result, { shouldValidate: true });
        };
        reader.readAsDataURL(file);
    };

    const { mutate: updateCompany, isPending: isUpdatingDados } = usePutApiCompaniesId({
        mutation: {
            onSuccess: () => {
                toast.success('Empresa atualizada com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar empresa.')
        }
    });

    const { mutate: uploadCert, isPending: isUploadingCert } = usePutApiCompaniesIdCertificate({
        mutation: {
            onSuccess: () => {
                toast.success('Certificado A1 instalado com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Senha incorreta ou arquivo inválido.')
        }
    });

    const { mutate: syncSefaz, isPending: isSyncing } = usePostApiCompaniesIdSyncSefaz({
        mutation: {
            onSuccess: (sefazData) => {
                toast.success('Dados sincronizados com a SEFAZ!');
                setDadosValue('corporateName', sefazData.corporateName || watchDados('corporateName'), { shouldValidate: true });
                setDadosValue('tradeName', sefazData.tradeName || watchDados('tradeName'), { shouldValidate: true });
                setDadosValue('stateRegistration', sefazData.stateRegistration || watchDados('stateRegistration'), { shouldValidate: true });
                setDadosValue('cnae', sefazData.cnae || watchDados('cnae'), { shouldValidate: true });
                setDadosValue('crt', sefazData.crt ?? watchDados('crt'), { shouldValidate: true });
                setDadosValue('zipCode', sefazData.zipCode || watchDados('zipCode'), { shouldValidate: true });
                setDadosValue('street', sefazData.street || watchDados('street'), { shouldValidate: true });
                setDadosValue('number', sefazData.number || watchDados('number'), { shouldValidate: true });
                setDadosValue('complement', sefazData.complement || watchDados('complement'), { shouldValidate: true });
                setDadosValue('neighborhood', sefazData.neighborhood || watchDados('neighborhood'), { shouldValidate: true });
                setDadosValue('cityName', sefazData.cityName || watchDados('cityName'), { shouldValidate: true });
                setDadosValue('cityCode', sefazData.cityCode || watchDados('cityCode'), { shouldValidate: true });
                setDadosValue('state', sefazData.state || watchDados('state'), { shouldValidate: true });
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao consultar SEFAZ.')
        }
    });

    // Inicia fluxo Google OAuth 2.0 em Popup
    const handleConnectGoogleOAuth = async () => {
        try {
            const res = await customInstance({
                url: `/api/companies/${empresaToEdit.id}/google-oauth/url`,
                method: 'GET'
            });

            if (res?.authUrl) {
                const width = 500;
                const height = 650;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;

                window.open(
                    res.authUrl,
                    'GoogleAuthPopup',
                    `width=${width},height=${height},top=${top},left=${left}`
                );

                const handleMessage = (event) => {
                    if (event.data?.type === 'GOOGLE_AUTH_SUCCESS') {
                        window.removeEventListener('message', handleMessage);
                        toast.success(`Conta do Google (${event.data.email}) conectada com sucesso!`);
                        queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                        onOpenChange(false);
                    }
                };
                window.addEventListener('message', handleMessage);
            }
        } catch (err) {
            toast.error(err.response?.data?.message || 'Erro ao iniciar autorização do Google.');
        }
    };

    const handleDisconnectGoogle = async () => {
        try {
            await customInstance({
                url: `/api/companies/${empresaToEdit.id}/google-oauth/disconnect`,
                method: 'POST'
            });
            toast.success('Conta do Google desconectada.');
            queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
            onOpenChange(false);
        } catch {
            toast.error('Erro ao desconectar conta do Google.');
        }
    };

    const handleTestEmail = async () => {
        if (!testEmailDestination || !testEmailDestination.includes('@')) {
            return toast.warning('Informe um endereço de e-mail válido para o teste.');
        }
        try {
            setIsTestingEmail(true);
            const res = await customInstance({
                url: `/api/companies/${empresaToEdit.id}/test-email?destinationEmail=${encodeURIComponent(testEmailDestination.trim())}`,
                method: 'POST'
            });
            toast.success(res?.message || 'E-mail de teste enviado com sucesso!');
        } catch (err) {
            toast.error(err.response?.data?.message || 'Falha ao disparar o e-mail de teste.');
        } finally {
            setIsTestingEmail(false);
        }
    };

    const onCertSubmit = (data) => {
        uploadCert({
            id: empresaToEdit.id,
            data: {
                certificateFile: data.certificateFile[0],
                certificatePassword: data.password
            }
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:w-[880px] !max-w-[880px] flex flex-col p-0 bg-white shadow-2xl">
                <SheetHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <SheetTitle className="text-xl font-bold text-slate-900">
                        Edição de Empresa Multi-Tenant
                    </SheetTitle>
                    <SheetDescription className="text-slate-500">
                        Atualize dados cadastrais, parâmetros fiscais, configurações de e-mail e certificado digital.
                    </SheetDescription>
                </SheetHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-6 border-b border-slate-100 bg-white">
                        <TabsList className="bg-transparent h-12 gap-3 p-0">
                            <TabsTrigger value="dados" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                <Building2 size={16} /> Dados Cadastrais & SEFAZ
                            </TabsTrigger>
                            <TabsTrigger value="email" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                <Mail size={16} /> Configuração de E-mail
                            </TabsTrigger>
                            <TabsTrigger value="certificado" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                <FileSignature size={16} /> Certificado Digital (A1)
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <form
                        id="formEmpresaPrincipal"
                        onSubmit={submitDados((data) => updateCompany({ id: empresaToEdit.id, data }))}
                        className="flex-1 flex flex-col min-h-0"
                    >
                        {/* ABA 1: DADOS */}
                        <TabsContent value="dados" className="flex-1 flex flex-col min-h-0 mt-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                <div className="bg-blue-50/40 p-5 rounded-xl border border-blue-100 space-y-2">
                                    <div className="flex items-end gap-4">
                                        <div className="flex-1 space-y-1.5">
                                            <Label className="text-slate-700 font-medium">CNPJ (Identificador Único)</Label>
                                            <Input
                                                value={empresaToEdit?.cnpj?.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5") || ''}
                                                disabled
                                                className="bg-white font-mono h-10 text-slate-600"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => syncSefaz({ id: empresaToEdit.id })}
                                            disabled={isSyncing}
                                            className="bg-white hover:bg-blue-600 hover:text-white border-blue-200 text-blue-700 font-medium transition-colors px-6 h-10"
                                        >
                                            {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                            Sincronizar com SEFAZ
                                        </Button>
                                    </div>
                                </div>

                                {/* LOGOMARCA */}
                                <div className="space-y-3">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                        <ImageIcon size={16} className="text-slate-400" /> Logomarca da Empresa (Impressão DANFE)
                                    </h3>
                                    <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                                        {logoBase64 ? (
                                            <div className="relative group shrink-0">
                                                <img
                                                    src={logoBase64}
                                                    alt="Preview Logo"
                                                    className="h-16 w-28 object-contain border border-slate-200 rounded-lg bg-white p-1 shadow-xs"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="destructive"
                                                    size="icon"
                                                    className="h-6 w-6 absolute -top-2 -right-2 rounded-full shadow-md"
                                                    onClick={() => setDadosValue('logoBase64', null, { shouldValidate: true })}
                                                >
                                                    <X size={12} />
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="h-16 w-28 border-2 border-dashed border-slate-300 rounded-lg bg-white flex flex-col items-center justify-center text-slate-400 text-[10px] shrink-0 font-medium gap-1">
                                                <UploadCloud size={20} className="text-slate-300" />
                                                <span>Sem Logomarca</span>
                                            </div>
                                        )}
                                        <div className="space-y-1.5 flex-1">
                                            <Label className="text-xs font-semibold text-slate-700">Selecionar arquivo de imagem</Label>
                                            <Input
                                                type="file"
                                                accept="image/png, image/jpeg, image/jpg"
                                                onChange={handleLogoUpload}
                                                className="cursor-pointer h-9 text-xs file:pt-0.5 bg-white"
                                            />
                                            <p className="text-[11px] text-slate-500">
                                                Formatos suportados: PNG, JPG ou JPEG (máximo 2MB).
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Identificação & Fiscal */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                        <Building2 size={16} className="text-slate-400" /> Identificação & Fiscal
                                    </h3>
                                    <div className="grid grid-cols-12 gap-4">
                                        <div className="col-span-7 space-y-1.5">
                                            <Label>Razão Social *</Label>
                                            <Input {...regDados('corporateName')} className="h-10" />
                                            {errDados.corporateName && <p className="text-xs text-rose-500">{errDados.corporateName.message}</p>}
                                        </div>
                                        <div className="col-span-5 space-y-1.5">
                                            <Label>Nome Fantasia</Label>
                                            <Input {...regDados('tradeName')} className="h-10" />
                                        </div>
                                        <div className="col-span-6 space-y-1.5">
                                            <Label className="font-semibold text-slate-800">Ambiente SEFAZ *</Label>
                                            <select
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-slate-300 bg-amber-50/50 px-3 py-2 text-xs font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500"
                                                {...regDados('environment')}
                                            >
                                                <option value={2}>🧪 Homologação (Testes sem valor fiscal)</option>
                                                <option value={1}>🚀 Produção (Emissão Real com valor jurídico)</option>
                                            </select>
                                        </div>
                                        <div className="col-span-6 space-y-1.5">
                                            <Label>Regime Tributário (CRT)</Label>
                                            <select
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                                {...regDados('crt')}
                                            >
                                                <option value={1}>1 - Simples Nacional</option>
                                                <option value={2}>2 - Simples Nac. (Excesso)</option>
                                                <option value={3}>3 - Regime Normal</option>
                                                <option value={4}>4 - Simples Nacional (MEI)</option>
                                            </select>
                                        </div>
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>Inscrição Estadual (IE)</Label>
                                            <Input {...regDados('stateRegistration')} className="h-10" />
                                        </div>
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>CNAE Fiscal</Label>
                                            <Input {...regDados('cnae')} placeholder="Ex: 4930-2/02" className="font-mono h-10" />
                                        </div>
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>Inscrição Municipal</Label>
                                            <Input {...regDados('municipalRegistration')} className="h-10" />
                                        </div>
                                    </div>
                                </div>

                                {/* Numeração Fiscal & Transporte */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                        <FileText size={16} className="text-slate-400" /> Numeração Fiscal & Transporte (ANTT)
                                    </h3>
                                    <div className="grid grid-cols-12 gap-4">
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>Série NF-e *</Label>
                                            <Input type="number" min="1" {...regDados('nfeSerie')} className="font-mono h-10" />
                                            {errDados.nfeSerie && <p className="text-xs text-rose-500">{errDados.nfeSerie.message}</p>}
                                        </div>
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>Próximo Nº NF-e *</Label>
                                            <Input type="number" min="1" {...regDados('nfeNextNumber')} className="font-mono h-10" />
                                            {errDados.nfeNextNumber && <p className="text-xs text-rose-500">{errDados.nfeNextNumber.message}</p>}
                                        </div>
                                        <div className="col-span-4 space-y-1.5">
                                            <Label className="flex items-center gap-1">
                                                <Truck size={13} /> RNTRC (ANTT)
                                            </Label>
                                            <Input {...regDados('rntrc')} placeholder="Ex: 12345678" className="font-mono h-10" />
                                        </div>
                                    </div>
                                </div>

                                {/* Contato */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Contato Geral</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label>E-mail Corporativo</Label>
                                            <Input type="email" {...regDados('email')} className="h-10" />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label>Telefone / Celular</Label>
                                            <Input {...regDados('phone')} className="h-10" />
                                        </div>
                                    </div>
                                </div>

                                {/* Endereço */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                        <MapPin size={16} className="text-slate-400" /> Endereço Sede
                                    </h3>
                                    <div className="grid grid-cols-12 gap-4">
                                        <div className="col-span-3 space-y-1.5">
                                            <Label>CEP</Label>
                                            <Input {...regDados('zipCode')} className="font-mono h-10" />
                                        </div>
                                        <div className="col-span-7 space-y-1.5">
                                            <Label>Logradouro</Label>
                                            <Input {...regDados('street')} className="h-10" />
                                        </div>
                                        <div className="col-span-2 space-y-1.5">
                                            <Label>Número</Label>
                                            <Input {...regDados('number')} className="h-10" />
                                        </div>
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>Complemento</Label>
                                            <Input {...regDados('complement')} className="h-10" />
                                        </div>
                                        <div className="col-span-3 space-y-1.5">
                                            <Label>Bairro</Label>
                                            <Input {...regDados('neighborhood')} className="h-10" />
                                        </div>
                                        <div className="col-span-5 space-y-1.5">
                                            <Label>Cidade</Label>
                                            <Input {...regDados('cityName')} className="h-10" />
                                        </div>
                                        <div className="col-span-3 space-y-1.5">
                                            <Label>Código IBGE</Label>
                                            <Input {...regDados('cityCode')} placeholder="Ex: 4308605" maxLength={7} className="font-mono h-10" />
                                        </div>
                                        <div className="col-span-2 space-y-1.5">
                                            <Label>UF *</Label>
                                            <Input maxLength={2} className="uppercase font-mono text-center h-10" {...regDados('state')} />
                                            {errDados.state && <p className="text-xs text-rose-500">{errDados.state.message}</p>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </TabsContent>

                        {/* ABA 2: CONFIGURAÇÃO DE E-MAIL */}
                        <TabsContent value="email" className="flex-1 flex flex-col min-h-0 mt-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-sm font-bold text-slate-800">Provedor de Envio de E-mails *</Label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDadosValue('emailProvider', 0, { shouldValidate: true })}
                                            className={`p-4 rounded-xl border text-left transition-all ${emailProvider === 0
                                                ? 'border-slate-800 bg-slate-50 ring-2 ring-slate-800/10'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                                }`}
                                        >
                                            <span className="font-bold text-xs text-slate-900 block">Desativado</span>
                                            <span className="text-[11px] text-slate-500 mt-1 block">Não enviar e-mails automáticos nesta empresa</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDadosValue('emailProvider', 1, { shouldValidate: true })}
                                            className={`p-4 rounded-xl border text-left transition-all ${emailProvider === 1
                                                ? 'border-blue-600 bg-blue-50/40 ring-2 ring-blue-600/20'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <Server size={14} className="text-blue-600" />
                                                <span className="font-bold text-xs text-slate-900 block">Servidor SMTP</span>
                                            </div>
                                            <span className="text-[11px] text-slate-500 mt-1 block">Host próprio, Office 365, SendGrid ou Gmail SMTP</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setDadosValue('emailProvider', 2, { shouldValidate: true })}
                                            className={`p-4 rounded-xl border text-left transition-all ${emailProvider === 2
                                                ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-600/20'
                                                : 'border-slate-200 hover:border-slate-300 bg-white'
                                                }`}
                                        >
                                            <div className="flex items-center gap-1.5">
                                                <Mail size={14} className="text-emerald-600" />
                                                <span className="font-bold text-xs text-slate-900 block">Google Workspace</span>
                                            </div>
                                            <span className="text-[11px] text-slate-500 mt-1 block">API Gmail via login OAuth 2.0 (Sem senhas de app)</span>
                                        </button>
                                    </div>
                                </div>

                                {emailProvider !== 0 && (
                                    <div className="space-y-4 pt-2 border-t border-slate-100">
                                        <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                            <Mail size={16} className="text-slate-400" /> Identificação do Remetente
                                        </h3>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1.5">
                                                <Label>Nome de Exibição do Remetente</Label>
                                                <Input
                                                    {...regDados('emailSenderName')}
                                                    placeholder="Ex: Faturamento Tramontina"
                                                    className="h-10 text-xs bg-white"
                                                />
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label>E-mail do Remetente *</Label>
                                                <Input
                                                    {...regDados('emailSenderAddress')}
                                                    placeholder="Ex: faturamento@empresa.com.br"
                                                    className="h-10 text-xs font-mono bg-white"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* FORMULÁRIO SMTP */}
                                {emailProvider === 1 && (
                                    <div className="space-y-4 pt-2 border-t border-slate-100 animate-in fade-in duration-200">
                                        <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                            <Server size={16} className="text-blue-600" /> Parâmetros do Servidor SMTP
                                        </h3>

                                        <div className="grid grid-cols-12 gap-4">
                                            <div className="col-span-8 space-y-1.5">
                                                <Label>Servidor SMTP (Host) *</Label>
                                                <Input
                                                    {...regDados('smtpHost')}
                                                    placeholder="Ex: smtp.gmail.com ou smtp.office365.com"
                                                    className="h-10 text-xs font-mono bg-white"
                                                />
                                            </div>
                                            <div className="col-span-4 space-y-1.5">
                                                <Label>Porta SMTP *</Label>
                                                <Input
                                                    type="number"
                                                    {...regDados('smtpPort')}
                                                    placeholder="587"
                                                    className="h-10 text-xs font-mono bg-white"
                                                />
                                            </div>

                                            <div className="col-span-6 space-y-1.5">
                                                <Label>Utilizador de Autenticação</Label>
                                                <Input
                                                    {...regDados('smtpUser')}
                                                    placeholder="Geralmente o e-mail completo"
                                                    className="h-10 text-xs font-mono bg-white"
                                                />
                                            </div>

                                            <div className="col-span-6 space-y-1.5">
                                                <div className="flex items-center justify-between">
                                                    <Label>Senha / Senha de Aplicação</Label>
                                                    {empresaToEdit?.hasSmtpPassword && (
                                                        <Badge variant="outline" className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border-emerald-200">
                                                            ✓ Senha Gravada
                                                        </Badge>
                                                    )}
                                                </div>
                                                <Input
                                                    type="password"
                                                    {...regDados('smtpPassword')}
                                                    placeholder={empresaToEdit?.hasSmtpPassword ? "•••••••• (Preencha apenas para alterar)" : "Digite a senha do SMTP"}
                                                    className="h-10 text-xs font-mono bg-white"
                                                />
                                            </div>

                                            <div className="col-span-12 flex items-center gap-2 pt-1">
                                                <input
                                                    type="checkbox"
                                                    id="smtpSslCheck"
                                                    {...regDados('smtpEnableSsl')}
                                                    className="rounded border-slate-300 text-blue-600 h-4 w-4"
                                                />
                                                <Label htmlFor="smtpSslCheck" className="text-xs font-medium text-slate-700 cursor-pointer">
                                                    Habilitar conexão segura via TLS / SSL (Recomendado)
                                                </Label>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* FORMULÁRIO GOOGLE WORKSPACE COM OAUTH 2.0 */}
                                {emailProvider === 2 && (
                                    <div className="space-y-4 pt-2 border-t border-slate-100 animate-in fade-in duration-200">
                                        <h3 className="text-sm font-semibold text-slate-900 border-b pb-1 flex items-center gap-2">
                                            <Mail size={16} className="text-emerald-600" /> Conexão Google Workspace (OAuth 2.0)
                                        </h3>

                                        <div className="p-5 border border-slate-200 rounded-xl bg-slate-50/60 space-y-4">
                                            {empresaToEdit?.hasGoogleOAuthConnected ? (
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="p-2.5 rounded-lg bg-emerald-100 text-emerald-800">
                                                            <CheckCircle2 size={20} />
                                                        </div>
                                                        <div>
                                                            <span className="font-bold text-xs text-slate-900 block">Conta Google Vinculada</span>
                                                            <span className="font-mono text-xs text-slate-600 block">{empresaToEdit.googleSenderEmail}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={handleConnectGoogleOAuth}
                                                            className="h-9 text-xs bg-white text-slate-700 shadow-2xs"
                                                        >
                                                            Reconectar
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            onClick={handleDisconnectGoogle}
                                                            className="h-9 text-xs border-rose-200 text-rose-700 hover:bg-rose-50"
                                                        >
                                                            Desconectar
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3 text-center py-4">
                                                    <p className="text-xs text-slate-600 max-w-md mx-auto">
                                                        Conecte a conta oficial do Google Workspace para disparar notas fiscais, DANFes e relatórios com a API do Gmail, sem necessidade de arquivos JSON de conta de serviço.
                                                    </p>
                                                    <Button
                                                        type="button"
                                                        onClick={handleConnectGoogleOAuth}
                                                        className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs h-10 px-5 shadow-xs inline-flex items-center gap-2"
                                                    >
                                                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                                                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                                        </svg>
                                                        Conectar com o Google Workspace
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* DISPARO DE TESTE */}
                                {emailProvider !== 0 && empresaToEdit?.id && (
                                    <div className="p-4 bg-slate-50/80 border border-slate-200 rounded-xl space-y-3 mt-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Send size={15} className="text-blue-600" />
                                                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                    Testar Conexão de E-mail
                                                </span>
                                            </div>
                                            <span className="text-[11px] text-slate-400">
                                                Salve alterações de SMTP antes de testar
                                            </span>
                                        </div>

                                        <div className="flex gap-2">
                                            <Input
                                                type="email"
                                                placeholder="Digite o e-mail de destino para o teste..."
                                                value={testEmailDestination}
                                                onChange={(e) => setTestEmailDestination(e.target.value)}
                                                className="h-10 text-xs bg-white flex-1"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={handleTestEmail}
                                                disabled={isTestingEmail || !testEmailDestination.trim()}
                                                className="h-10 text-xs bg-white hover:bg-blue-50 text-blue-700 border-blue-200 font-bold px-4 shrink-0 shadow-2xs"
                                            >
                                                {isTestingEmail ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
                                                Disparar Teste
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        {(activeTab === 'dados' || activeTab === 'email') && (
                            <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-5">
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isUpdatingDados || isSyncing}
                                    className="bg-slate-900 hover:bg-slate-800 text-white min-w-[150px] px-6"
                                >
                                    {isUpdatingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar Empresa</>}
                                </Button>
                            </SheetFooter>
                        )}
                    </form>

                    {/* ABA 3: CERTIFICADO */}
                    <TabsContent value="certificado" className="flex-1 flex flex-col min-h-0 mt-0">
                        <form onSubmit={submitCert(onCertSubmit)} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm flex items-start gap-3">
                                    <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                                    <p className="leading-relaxed">
                                        O certificado <strong>A1 (.pfx)</strong> é exigido para emissão de NF-e/CT-e, comunicação com a SEFAZ e sincronização cadastral. Ele é armazenado criptografado no servidor.
                                    </p>
                                </div>

                                {empresaToEdit?.certificateExpiration && (
                                    <div className="p-4 rounded-xl border bg-slate-50 flex items-center justify-between text-xs">
                                        <span className="text-slate-600 font-semibold flex items-center gap-1.5">
                                            <ShieldCheck size={16} className="text-emerald-600" /> Certificado Atual Instalado:
                                        </span>
                                        <span className="font-mono font-bold text-slate-800">
                                            Validade até {new Date(empresaToEdit.certificateExpiration).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label>Arquivo do Certificado (.pfx / .p12) *</Label>
                                    <Input type="file" accept=".pfx,.p12" {...regCert('certificateFile')} className="cursor-pointer h-10 file:pt-1 bg-white" />
                                    {errCert.certificateFile && <p className="text-xs text-rose-500">{errCert.certificateFile.message}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Senha do Certificado *</Label>
                                    <Input type="password" placeholder="Digite a senha de instalação" {...regCert('password')} className="h-10 bg-white" />
                                    {errCert.password && <p className="text-xs text-rose-500">{errCert.password.message}</p>}
                                </div>
                            </div>

                            <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-5">
                                    Cancelar
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isUploadingCert}
                                    className="bg-slate-900 hover:bg-slate-800 text-white min-w-[180px] px-6"
                                >
                                    {isUploadingCert ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileKey2 className="mr-2 h-4 w-4" /> Instalar Certificado</>}
                                </Button>
                            </SheetFooter>
                        </form>
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}