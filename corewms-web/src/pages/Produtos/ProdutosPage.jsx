import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Box } from 'lucide-react';
import ProductsTab from './ProductsTab';
import PackagingTypesTab from './PackagingTypesTab';

export default function ProdutosPage() {
    // Estado que controla a tab visível para ativar o Lazy Mounting
    const [currentTab, setCurrentTab] = useState("products");

    return (
        <div className="flex flex-col h-full space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catálogo de Produtos e Volumes</h1>
                <p className="text-sm text-slate-500 mt-1">Gerencie os SKUs, regras logísticas e tipos de volumes do armazém.</p>
            </div>

            <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-1 flex flex-col min-h-0">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-sm">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="products" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Package className="w-4 h-4 mr-2" /> SKUs e Materiais
                        </TabsTrigger>
                        <TabsTrigger value="packagings" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Box className="w-4 h-4 mr-2" /> Tipos de Volumes
                        </TabsTrigger>
                    </TabsList>
                </div>

                <div className="flex-1 mt-4 overflow-hidden relative">
                    {/* Renderização Condicional: Monta a Tab de Produtos apenas se for a ativa */}
                    {currentTab === 'products' && (
                        <div className="absolute inset-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <ProductsTab />
                        </div>
                    )}

                    {/* Renderização Condicional: Monta a Tab de Embalagens apenas se for a ativa */}
                    {currentTab === 'packagings' && (
                        <div className="absolute inset-0 h-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <PackagingTypesTab />
                        </div>
                    )}
                </div>
            </Tabs>
        </div>
    );
}