import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Map, Layers } from 'lucide-react';
import StorageTypesTab from './StorageTypesTab';
import LayoutFisicoTab from './LayoutFisicoTab';

export default function TopologiaPage() {
    return (
        <div className="flex flex-col h-full space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Topologia do Armazém</h1>
                <p className="text-sm text-slate-500 mt-1">Mapeie a infraestrutura física (Blocados, Porta-Pallets) e crie os endereços do WMS.</p>
            </div>

            <Tabs defaultValue="layout" className="flex-1 flex flex-col min-h-0">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-sm">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="layout" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Map className="w-4 h-4 mr-2" /> Layout Físico
                        </TabsTrigger>
                        <TabsTrigger value="tipos" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Layers className="w-4 h-4 mr-2" /> Regras de Armazenamento
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="layout" className="flex-1 mt-4 overflow-hidden">
                    <LayoutFisicoTab />
                </TabsContent>

                <TabsContent value="tipos" className="flex-1 mt-4 overflow-hidden">
                    <StorageTypesTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}