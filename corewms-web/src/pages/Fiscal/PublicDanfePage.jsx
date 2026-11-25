import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';

export default function PublicDanfePage() {
    const { accessKey } = useParams();

    const cleanKey = (accessKey || '').replace(/\D/g, '');
    const validationError = !accessKey
        ? 'Chave de acesso não informada.'
        : cleanKey.length !== 44
            ? 'Chave de acesso da NF-e inválida. Deve conter 44 dígitos.'
            : null;

    const [fetchError, setFetchError] = useState(null);

    useEffect(() => {
        if (validationError) return;

        let isMounted = true;
        const apiBaseUrl = import.meta.env.VITE_API_URL || '';
        const endpointUrl = `${apiBaseUrl}/api/public/danfe/${cleanKey}`;

        fetch(endpointUrl)
            .then(async (res) => {
                if (!res.ok) {
                    const errText = await res.text();
                    throw new Error(errText || 'Documento fiscal não localizado ou ainda não autorizado.');
                }

                const html = await res.text();
                if (html.includes('<div id="root">') || !html.includes('DANFE')) {
                    throw new Error('A API retornou a aplicação React em vez do documento fiscal. Verifique se o backend está em execução e acessível.');
                }

                return html;
            })
            .then((html) => {
                if (!isMounted) return;
                document.open();
                document.write(html);
                document.close();
            })
            .catch((err) => {
                if (isMounted) {
                    setFetchError(err.message || 'Erro ao carregar visualização da DANFE.');
                }
            });

        return () => {
            isMounted = false;
        };
    }, [cleanKey, validationError]);

    const error = validationError || fetchError;

    if (!error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 font-sans">
                <Loader2 className="h-8 w-8 animate-spin text-orange-600 mb-2" />
                <span className="text-sm font-medium text-slate-600">Carregando DANFE oficial...</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 font-sans">
            <div className="bg-white p-6 rounded-xl shadow-xs border border-slate-200 max-w-md text-center">
                <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
                <h2 className="text-base font-bold text-slate-800 mb-1">Não foi possível carregar a DANFE</h2>
                <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
            </div>
        </div>
    );
}