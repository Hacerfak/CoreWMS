import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
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
import { Loader2, Building2, Save, FileKey2, UploadCloud, AlertCircle, Sparkles, MapPin, FileSignature } from 'lucide-react';
import { toast } from 'sonner';

const empresaSchema = z.object({
    corporateName: z.string().min(3, 'Razão Social obrigatória.'),
    tradeName: z.string().optional(),
    stateRegistration: z.string().optional(),
    municipalRegistration: z.string().optional(),
    cnae: z.string().optional(),
    crt: z.coerce.number().optional().nullable(),
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
    logoBase64: z.string().optional().nullable()
});

const certSchema = z.object({
    certificateFile: z.any().refine((files) => files?.length === 1, 'Selecione o arquivo PFX.'),
    password: z.string().min(1, 'A senha é obrigatória.')
});

export default function EmpresaFormModal({ open, onOpenChange, empresaToEdit }) {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState('dados');

    const { register: regDados, handleSubmit: submitDados, setValue: setDadosValue, reset: resetDados, watch: watchDados, formState: { errors: errDados } } = useForm({
        resolver: zodResolver(empresaSchema)
    });

    const { register: regCert, handleSubmit: submitCert, reset: resetCert, formState: { errors: errCert } } = useForm({
        resolver: zodResolver(certSchema)
    });

    useEffect(() => {
        if (open && empresaToEdit) {
            resetDados({
                corporateName: empresaToEdit.corporateName || '',
                tradeName: empresaToEdit.tradeName || '',
                stateRegistration: empresaToEdit.stateRegistration || '',
                municipalRegistration: empresaToEdit.municipalRegistration || '',
                cnae: empresaToEdit.cnae || '',
                crt: empresaToEdit.crt || 1,
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
                logoBase64: empresaToEdit.logoBase64 || null
            });
            resetCert();
            setActiveTab('dados');
        }
    }, [open, empresaToEdit, resetDados, resetCert]);

    // Mutações da API
    const { mutate: updateCompany, isPending: isUpdatingDados } = usePutApiCompaniesId({
        mutation: {
            onSuccess: () => {
                toast.success('Dados atualizados com sucesso!');
                queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atualizar dados.')
        }
    });

    const { mutate: uploadCert, isPending: isUploadingCert } = usePutApiCompaniesIdCertificate({
        mutation: {
            onSuccess: () => {
                toast.success(`Certificado validado! Validade atualizada.`);
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
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao consultar a SEFAZ. Verifique se o certificado é válido.')
        }
    });

    const handleFileToBase64 = (e, setValueCallback, fieldName) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result.split(',')[1];
            setValueCallback(fieldName, base64, { shouldValidate: true });
        };
        reader.readAsDataURL(file);
    };

    const onCertSubmit = (data) => {
        const formData = new FormData();
        formData.append('certificateFile', data.certificateFile[0]);
        formData.append('certificatePassword', data.password);
        uploadCert({ id: empresaToEdit.id, data: formData });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:w-[850px] !max-w-[850px] flex flex-col p-0 bg-white shadow-2xl">
                <SheetHeader className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <SheetTitle className="text-xl font-bold text-slate-900">
                        Edição de Empresa Multi-Tenant
                    </SheetTitle>
                    <SheetDescription className="text-slate-500">
                        Atualize dados cadastrais, informações fiscais e instale o certificado digital da matriz.
                    </SheetDescription>
                </SheetHeader>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
                    <div className="px-6 border-b border-slate-100 bg-white">
                        <TabsList className="bg-transparent h-12 gap-3 p-0">
                            <TabsTrigger value="dados" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                <Building2 size={16} /> Dados Cadastrais
                            </TabsTrigger>
                            <TabsTrigger value="certificado" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 gap-2 px-4">
                                <FileSignature size={16} /> Certificado Digital (A1)
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ABA 1: DADOS GERAIS */}
                    <TabsContent value="dados" className="flex-1 flex flex-col min-h-0 mt-0">
                        <form onSubmit={submitDados((data) => updateCompany({ id: empresaToEdit.id, data }))} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">

                                {/* DESTAQUE CNPJ + SEFAZ */}
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
                                        <div className="col-span-4 space-y-1.5">
                                            <Label>Regime Tributário (CRT)</Label>
                                            <select
                                                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                                                {...regDados('crt')}
                                            >
                                                <option value="">Selecione...</option>
                                                <option value="1">1 - Simples Nacional</option>
                                                <option value="2">2 - Simples Nac. (Excesso)</option>
                                                <option value="3">3 - Regime Normal</option>
                                                <option value="4">4 - Simples Nacional (MEI)</option>
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
                                        <div className="col-span-6 space-y-1.5">
                                            <Label>Inscrição Municipal</Label>
                                            <Input {...regDados('municipalRegistration')} className="h-10" />
                                        </div>
                                        <div className="col-span-6 space-y-1.5">
                                            <Label>Inscrição Estadual (ST)</Label>
                                            <Input {...regDados('iest')} className="h-10" />
                                        </div>
                                    </div>
                                </div>

                                {/* Contato */}
                                <div className="space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Contato</h3>
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

                                {/* Logotipo */}
                                <div className="space-y-4 pb-4">
                                    <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Identidade Visual</h3>
                                    <div className="space-y-2">
                                        <Label>Logotipo da Empresa (PNG/JPG)</Label>
                                        <div className="flex items-center gap-4">
                                            {watchDados('logoBase64') ? (
                                                <img src={`data:image/png;base64,${watchDados('logoBase64')}`} alt="Logo" className="w-16 h-16 rounded-xl object-contain border border-slate-200 bg-slate-50 shadow-sm" />
                                            ) : (
                                                <div className="w-16 h-16 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                                                    <UploadCloud size={24} />
                                                </div>
                                            )}
                                            <Input type="file" accept="image/*" onChange={(e) => handleFileToBase64(e, setDadosValue, 'logoBase64')} className="flex-1 cursor-pointer h-10 file:pt-1" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-5">Cancelar</Button>
                                <Button type="submit" disabled={isUpdatingDados || isSyncing} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[150px] px-6">
                                    {isUpdatingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar Empresa</>}
                                </Button>
                            </SheetFooter>
                        </form>
                    </TabsContent>

                    {/* ABA 2: CERTIFICADO */}
                    <TabsContent value="certificado" className="flex-1 flex flex-col min-h-0 mt-0">
                        <form onSubmit={submitCert(onCertSubmit)} className="flex-1 flex flex-col min-h-0">
                            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-xl text-sm flex items-start gap-3">
                                    <AlertCircle size={20} className="mt-0.5 shrink-0 text-amber-600" />
                                    <p className="leading-relaxed">O certificado <strong>A1 (.pfx)</strong> é exigido para a emissão de NFe/CTe, comunicação com a SEFAZ e sincronização de cadastro. Ele será validado criptograficamente e armazenado de forma segura no backend.</p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Arquivo do Certificado (.pfx / .p12) *</Label>
                                    <Input type="file" accept=".pfx,.p12" {...regCert('certificateFile')} className="cursor-pointer h-10 file:pt-1" />
                                    {errCert.certificateFile && <p className="text-xs text-rose-500">{errCert.certificateFile.message}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label>Senha do Certificado *</Label>
                                    <Input type="password" placeholder="Digite a senha original de instalação" {...regCert('password')} className="h-10" />
                                    {errCert.password && <p className="text-xs text-rose-500">{errCert.password.message}</p>}
                                </div>
                            </div>

                            <SheetFooter className="p-6 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="px-5">Cancelar</Button>
                                <Button type="submit" disabled={isUploadingCert} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[180px] px-6">
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