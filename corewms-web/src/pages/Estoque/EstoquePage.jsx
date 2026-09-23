import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Boxes, Layers, ScrollText, UploadCloud } from 'lucide-react';
import BalancoTab from './Tabs/BalancoTab';
import HandlingUnitsTab from './Tabs/HandlingUnitsTab';
import KardexTab from './Tabs/KardexTab';
import ImportarLegadoModal from './ImportarLegadoModal';

export default function EstoquePage() {
    const [currentTab, setCurrentTab] = useState('balances');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    return (
        <div className="flex flex-col space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Consulta e Relatórios de Estoque</h1>
                    <p className="text-sm text-slate-500 mt-1">Acompanhe saldos físicos por produto, rastreie volumes (HUs) e audite o extrato Kardex.</p>
                </div>

                <Button
                    onClick={() => setIsImportModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                >
                    <UploadCloud className="mr-2 h-4 w-4" /> Importar Inventário Legado
                </Button>
            </div>

            <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col min-h-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-sm">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="balances" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4">
                            <Boxes className="w-4 h-4 mr-2" /> Balanço de Estoque
                        </TabsTrigger>
                        <TabsTrigger value="hus" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4">
                            <Layers className="w-4 h-4 mr-2" /> Unidades de Manuseio (HUs)
                        </TabsTrigger>
                        <TabsTrigger value="kardex" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 px-4">
                            <ScrollText className="w-4 h-4 mr-2" /> Kardex (Extrato)
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 mt-4 relative">
                    {/* Lazy Mounting: Carrega o componente apenas quando a aba estiver ativa */}
                    {currentTab === 'balances' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <BalancoTab />
                        </div>
                    )}

                    {currentTab === 'hus' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <HandlingUnitsTab />
                        </div>
                    )}

                    {currentTab === 'kardex' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <KardexTab />
                        </div>
                    )}
                </div>
            </Tabs>

            <ImportarLegadoModal open={isImportModalOpen} onOpenChange={setIsImportModalOpen} />
        </div>
    );
}