import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { usePutApiCompaniesId, usePutApiCompaniesIdCertificate } from '@/api/generated/companies/companies';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, Save, FileKey2, UploadCloud, AlertCircle } from 'lucide-react';
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
            onSuccess: (res) => {
                toast.success(`Certificado validado! Validade atualizada.`);
                queryClient.invalidateQueries({ queryKey: ['/api/companies'] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Senha incorreta ou arquivo inválido.')
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-4xl bg-white p-0 overflow-hidden">
                <div className="p-6 pb-2">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-slate-900">
                            <Building2 className="text-blue-600" size={20} /> Edição de Empresa
                        </DialogTitle>
                        <DialogDescription className="text-slate-500">
                            Atualize dados cadastrais, informações fiscais e certificado digital.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <div className="px-6 border-b border-slate-100">
                        <TabsList className="bg-transparent h-10 gap-4 w-full justify-start">
                            <TabsTrigger value="dados" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-0">
                                Dados Cadastrais
                            </TabsTrigger>
                            <TabsTrigger value="certificado" className="data-[state=active]:border-b-2 data-[state=active]:border-blue-600 data-[state=active]:shadow-none rounded-none px-0">
                                Certificado Digital (A1)
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ABA 1: DADOS GERAIS */}
                    <TabsContent value="dados" className="p-6 pt-4 m-0 outline-none h-[65vh] overflow-y-auto">
                        <form onSubmit={submitDados((data) => updateCompany({ id: empresaToEdit.id, data }))} className="space-y-6">

                            {/* Identificação & Fiscal */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Identificação & Fiscal</h3>
                                <div className="grid grid-cols-12 gap-4">
                                    <div className="col-span-6 space-y-2">
                                        <Label>Razão Social *</Label>
                                        <Input {...regDados('corporateName')} />
                                        {errDados.corporateName && <p className="text-xs text-rose-500">{errDados.corporateName.message}</p>}
                                    </div>
                                    <div className="col-span-6 space-y-2">
                                        <Label>Nome Fantasia</Label>
                                        <Input {...regDados('tradeName')} />
                                    </div>

                                    <div className="col-span-3 space-y-2">
                                        <Label>CNPJ</Label>
                                        <Input value={empresaToEdit?.cnpj || ''} disabled className="bg-slate-50 text-slate-500" />
                                    </div>
                                    <div className="col-span-3 space-y-2">
                                        <Label>Regime Tributário (CRT)</Label>
                                        <select
                                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                            {...regDados('crt')}
                                        >
                                            <option value="">Selecione...</option>
                                            <option value="1">1 - Simples Nacional</option>
                                            <option value="2">2 - Simples Nac. (Excesso)</option>
                                            <option value="3">3 - Regime Normal</option>
                                        </select>
                                    </div>
                                    <div className="col-span-3 space-y-2">
                                        <Label>Inscrição Estadual (IE)</Label>
                                        <Input {...regDados('stateRegistration')} />
                                    </div>
                                    <div className="col-span-3 space-y-2">
                                        <Label>Inscrição Estadual (ST)</Label>
                                        <Input {...regDados('iest')} />
                                    </div>

                                    <div className="col-span-3 space-y-2">
                                        <Label>Inscrição Municipal</Label>
                                        <Input {...regDados('municipalRegistration')} />
                                    </div>
                                    <div className="col-span-3 space-y-2">
                                        <Label>CNAE Fiscal</Label>
                                        <Input {...regDados('cnae')} placeholder="Ex: 4930202" />
                                    </div>
                                </div>
                            </div>

                            {/* Contato */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Contato</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>E-mail Corporativo</Label>
                                        <Input type="email" {...regDados('email')} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Telefone / Celular</Label>
                                        <Input {...regDados('phone')} />
                                    </div>
                                </div>
                            </div>

                            {/* Endereço */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-slate-900 border-b pb-1">Endereço Fiscal</h3>
                                <div className="grid grid-cols-12 gap-4">
                                    <div className="col-span-3 space-y-2">
                                        <Label>CEP</Label>
                                        <Input {...regDados('zipCode')} />
                                    </div>
                                    <div className="col-span-7 space-y-2">
                                        <Label>Logradouro</Label>
                                        <Input {...regDados('street')} />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <Label>Número</Label>
                                        <Input {...regDados('number')} />
                                    </div>

                                    <div className="col-span-4 space-y-2">
                                        <Label>Complemento</Label>
                                        <Input {...regDados('complement')} />
                                    </div>
                                    <div className="col-span-3 space-y-2">
                                        <Label>Bairro</Label>
                                        <Input {...regDados('neighborhood')} />
                                    </div>
                                    <div className="col-span-5 space-y-2">
                                        <Label>Cidade</Label>
                                        <Input {...regDados('cityName')} />
                                    </div>

                                    <div className="col-span-3 space-y-2">
                                        <Label>Código IBGE (Cidade)</Label>
                                        <Input {...regDados('cityCode')} placeholder="Ex: 4308605" maxLength={7} />
                                    </div>
                                    <div className="col-span-2 space-y-2">
                                        <Label>UF *</Label>
                                        <Input maxLength={2} className="uppercase" {...regDados('state')} />
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
                                            <img src={`data:image/png;base64,${watchDados('logoBase64')}`} alt="Logo" className="w-16 h-16 rounded object-contain border border-slate-200 bg-slate-50" />
                                        ) : (
                                            <div className="w-16 h-16 rounded border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400">
                                                <UploadCloud size={24} />
                                            </div>
                                        )}
                                        <Input type="file" accept="image/*" onChange={(e) => handleFileToBase64(e, setDadosValue, 'logoBase64')} className="flex-1 cursor-pointer" />
                                    </div>
                                </div>
                            </div>

                            <div className="sticky bottom-0 bg-white pt-4 border-t border-slate-100 flex justify-end gap-2 pb-2">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                                <Button type="submit" disabled={isUpdatingDados} className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px]">
                                    {isUpdatingDados ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Atualizar Dados</>}
                                </Button>
                            </div>
                        </form>
                    </TabsContent>

                    {/* ABA 2: CERTIFICADO */}
                    <TabsContent value="certificado" className="p-6 pt-4 m-0 outline-none">
                        <form onSubmit={submitCert(onCertSubmit)} className="space-y-4">
                            <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-sm flex items-start gap-2 mb-4">
                                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                                <p>O certificado <strong>A1 (.pfx)</strong> é exigido para a emissão de NFe/CTe e comunicação com a SEFAZ. Ele será validado criptograficamente pelo backend.</p>
                            </div>

                            <div className="space-y-2">
                                <Label>Arquivo do Certificado (.pfx / .p12) *</Label>
                                <Input type="file" accept=".pfx,.p12" {...regCert('certificateFile')} className="cursor-pointer" />
                                {errCert.certificateFile && <p className="text-xs text-rose-500">{errCert.certificateFile.message}</p>}
                            </div>

                            <div className="space-y-2">
                                <Label>Senha do Certificado *</Label>
                                <Input type="password" placeholder="Digite a senha original de instalação" {...regCert('password')} />
                                {errCert.password && <p className="text-xs text-rose-500">{errCert.password.message}</p>}
                            </div>

                            <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 mt-6">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                                <Button type="submit" disabled={isUploadingCert} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                                    {isUploadingCert ? <Loader2 className="h-4 w-4 animate-spin" /> : <><FileKey2 className="mr-2 h-4 w-4" /> Instalar Certificado</>}
                                </Button>
                            </div>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}