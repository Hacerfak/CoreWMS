import { useState } from 'react';
import { usePostApiInboundPutaway } from '@/api/generated/inbound/inbound';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowRightLeft, Loader2, Barcode } from 'lucide-react';
import { toast } from 'sonner';

export default function PutawayTab({ orderId, companyId }) {
    const [scannedLpns, setScannedLpns] = useState('');
    const [destinationId, setDestinationId] = useState('');

    const lpnList = scannedLpns.split('\n').map(s => s.trim()).filter(Boolean);

    const { mutate: executePutaway, isPending } = usePostApiInboundPutaway({
        mutation: {
            onSuccess: (data) => {
                toast.success(data.message || 'LPNs alocados no bloco com sucesso.');
                setScannedLpns('');
                setDestinationId('');
            },
            onError: (err) => toast.error(err.response?.data?.message || 'Erro na alocação.')
        }
    });

    const handleAllocate = () => {
        if (lpnList.length === 0) return toast.error('Informe pelo menos um LPN.');
        if (!destinationId) return toast.error('Informe o Endereço de destino.');

        executePutaway({
            data: {
                scannedLpns: lpnList,
                destinationLocationId: destinationId
            }
        });
    };

    return (
        <div className="max-w-2xl bg-slate-50 border border-slate-100 rounded-xl p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2"><ArrowRightLeft size={20} className="text-blue-600" /> Alocação (Putaway)</h3>
            <p className="text-sm text-slate-500 mb-6">Mova as Handling Units geradas na doca para o bloco de estocagem final.</p>

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <Label className="flex items-center gap-2"><Barcode size={16} /> LPNs Bipados / Selecionados</Label>
                    <Textarea
                        value={scannedLpns}
                        onChange={(e) => setScannedLpns(e.target.value)}
                        placeholder="Bipe as etiquetas HUs aqui (uma por linha)..."
                        className="font-mono text-sm min-h-[120px]"
                    />
                    <p className="text-xs text-slate-500 text-right">{lpnList.length} volumes identificados.</p>
                </div>

                <div className="space-y-1.5">
                    <Label>Endereço de Destino (ID Posição)</Label>
                    <Input
                        value={destinationId}
                        onChange={(e) => setDestinationId(e.target.value)}
                        placeholder="Ex: P1-BLC-05"
                        className="font-mono uppercase h-12"
                    />
                </div>

                <Button
                    onClick={handleAllocate}
                    disabled={isPending || lpnList.length === 0 || !destinationId}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 text-base mt-2 shadow-lg"
                >
                    {isPending ? <Loader2 className="animate-spin h-5 w-5" /> : 'Confirmar Movimentação Física'}
                </Button>
            </div>
        </div>
    );
}