import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { usePutApiUsersMe } from '@/api/generated/users/users';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2, Save, UserCircle } from 'lucide-react';
import { toast } from 'sonner';

const profileSchema = z.object({
    name: z.string().min(3, 'O nome deve ter no mínimo 3 caracteres.'),
    email: z.string().email('Formato de e-mail inválido.'),
    password: z.string().optional() // Opcional: só preenche se quiser alterar
});

export default function MeuPerfilModal({ open, onOpenChange, currentUser }) {
    const { register, handleSubmit, reset, formState: { errors } } = useForm({
        resolver: zodResolver(profileSchema),
        defaultValues: { name: '', email: '', password: '' }
    });

    useEffect(() => {
        if (open && currentUser) {
            reset({
                name: currentUser.userName || '',
                email: currentUser.email || '',
                password: ''
            });
        }
    }, [open, currentUser, reset]);

    const { mutate: updateProfile, isPending } = usePutApiUsersMe({
        mutation: {
            onSuccess: () => {
                toast.success('Seu perfil foi atualizado com sucesso! Faça login novamente se alterou a senha.');
                onOpenChange(false);
            },
            onError: (err) => {
                toast.error(err.response?.data?.detail || 'Erro ao atualizar o perfil.');
            }
        }
    });

    const onSubmit = (data) => {
        const payload = {
            name: data.name,
            email: data.email,
            // Só envia a senha se o usuário digitou algo novo
            password: data.password ? data.password : undefined
        };
        updateProfile({ data: payload });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-white">
                <DialogHeader>
                    <DialogTitle className="text-slate-900 flex items-center gap-2">
                        <UserCircle className="text-blue-600" size={20} /> Meu Perfil
                    </DialogTitle>
                    <DialogDescription className="text-slate-500">
                        Atualize suas informações de acesso.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="profile-name" className="text-slate-700">Nome Completo</Label>
                        <Input id="profile-name" {...register('name')} className={`bg-slate-50 ${errors.name ? 'border-rose-500' : ''}`} />
                        {errors.name && <p className="text-xs text-rose-500">{errors.name.message}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="profile-email" className="text-slate-700">E-mail</Label>
                        <Input id="profile-email" type="email" {...register('email')} className={`bg-slate-50 ${errors.email ? 'border-rose-500' : ''}`} />
                        {errors.email && <p className="text-xs text-rose-500">{errors.email.message}</p>}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <Label htmlFor="profile-password" className="text-slate-700">Nova Senha (Opcional)</Label>
                        <Input id="profile-password" type="password" placeholder="Preencha apenas se desejar alterar" {...register('password')} className={`bg-slate-50 ${errors.password ? 'border-rose-500' : ''}`} />
                        {errors.password && <p className="text-xs text-rose-500">{errors.password.message}</p>}
                    </div>

                    <DialogFooter className="pt-4 border-t border-slate-100">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
                        <Button type="submit" disabled={isPending} className="bg-slate-900 hover:bg-slate-800 text-white min-w-[120px]">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="mr-2 h-4 w-4" /> Salvar</>}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}