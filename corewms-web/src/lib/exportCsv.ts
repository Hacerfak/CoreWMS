import { api } from '@/api/client';
import { toast } from 'sonner';

export async function downloadBackendCsv(
    endpointUrl: string,
    params: Record<string, unknown>,
    defaultFileName: string
): Promise<void> {
    try {
        toast.info('Gerando relatório completo no servidor...');

        const response = await api.get<Blob>(endpointUrl, {
            params,
            responseType: 'blob'
        });

        const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8;' }));
        const link = document.createElement('a');
        link.href = url;

        const contentDisposition = response.headers['content-disposition'] as string | undefined;
        let fileName = `${defaultFileName}_${new Date().toISOString().slice(0, 10)}.csv`;

        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match && match[1]) fileName = match[1];
        }

        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);

        toast.success('Relatório baixado com sucesso!');
    } catch {
        toast.error('Erro ao gerar relatório no servidor.');
    }
}