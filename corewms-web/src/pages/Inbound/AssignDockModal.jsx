import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePostApiInboundItemsIdAssignDock } from '@/api/generated/inbound/inbound';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AssignDockModal({ open, onOpenChange, item, orderId }) {
    const queryClient = useQueryClient();
    const [dockLocationId, setDockLocationId] = useState('');

    const { mutate: assignDock, isPending } = usePostApiInboundItemsIdAssignDock({
        mutation: {
            onSuccess: () => {
                toast.success('Doca atribuída com sucesso.');
                queryClient.invalidateQueries({ queryKey: [`/api/inbound/${orderId}`] });
                onOpenChange(false);
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro ao atribuir doca.')
        }
    });

    return (
        <Dialog open={open} onOpenChange={(v) => !isPending && onOpenChange(v)}>
            <DialogContent className="sm:max-w-sm bg-white">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><MapPin className="text-blue-600" /> Indicar Doca para o Item</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-1.5">
                        <Label>Código / ID da Doca</Label>
                        <Input
                            value={dockLocationId}
                            onChange={(e) => setDockLocationId(e.target.value)}
                            placeholder="Ex: ID da Location"
                            className="font-mono h-10"
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
                    <Button onClick={() => assignDock({ id: item.id, data: { dockLocationId } })} disabled={isPending || !dockLocationId} className="bg-slate-900 text-white">
                        {isPending ? <Loader2 className="animate-spin" /> : 'Confirmar'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}