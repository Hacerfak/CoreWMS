import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Box } from 'lucide-react';
import ProductsTab from './ProductsTab';
import PackagingTypesTab from './PackagingTypesTab';

export default function ProdutosPage() {
    return (
        <div className="flex flex-col h-full space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Catálogo de Produtos</h1>
                <p className="text-sm text-slate-500 mt-1">Gerencie os SKUs, regras logísticas e tipos de volumes (caixas, pallets) do armazém.</p>
            </div>

            <Tabs defaultValue="products" className="flex-1 flex flex-col min-h-0">
                <div className="bg-white border border-slate-200/60 rounded-xl p-1 w-fit shadow-sm">
                    <TabsList className="bg-transparent h-10 gap-1">
                        <TabsTrigger value="products" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Package className="w-4 h-4 mr-2" /> SKUs e Materiais
                        </TabsTrigger>
                        <TabsTrigger value="packagings" className="data-[state=active]:bg-slate-100 data-[state=active]:text-slate-900 data-[state=active]:shadow-none px-4">
                            <Box className="w-4 h-4 mr-2" /> Tipos de Embalagem (Global)
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="products" className="flex-1 mt-4 overflow-hidden">
                    <ProductsTab />
                </TabsContent>

                <TabsContent value="packagings" className="flex-1 mt-4 overflow-hidden">
                    <PackagingTypesTab />
                </TabsContent>
            </Tabs>
        </div>
    );
}