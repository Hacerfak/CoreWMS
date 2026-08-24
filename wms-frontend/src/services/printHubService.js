import api from './api';

// --- AGENTES ---
export const getAgentes = async () => {
    const response = await api.get('/api/printing/agents');
    return (response.data || []).map(a => ({
        id: a.id,
        nome: a.name,
        hostname: 'localhost',
        statusConexao: 'ONLINE',
        ativo: true
    }));
};

export const criarAgente = async (dados) => {
    const response = await api.post('/api/printing/agents', { name: dados.nome });
    return response.data;
};

export const excluirAgente = async () => { };
export const atualizarAgente = async () => { };

// --- IMPRESSORAS ---
export const getImpressorasAdmin = async () => {
    return [];
};

export const getImpressorasAtivas = async () => {
    return [];
};

export const salvarImpressora = async (dados) => {
    const payload = {
        printAgentId: dados.agenteId || dados.printAgentId,
        name: dados.nome,
        target: dados.enderecoIp || dados.caminhoCompartilhamento || '127.0.0.1'
    };
    const response = await api.post('/api/printing/printers', payload);
    return response.data;
};

export const testarImpressora = async (id, printerName, zpl) => {
    await api.post('/api/print/send-test', {
        stationName: "Web",
        printerName: printerName || "Zebra_Test",
        customZpl: zpl || "^XA^FO50,50^A0N,50,50^FDTESTE COREWMS^FS^XZ"
    });
};

// --- TEMPLATES ---
export const getTemplates = async () => {
    const response = await api.get('/api/printing/templates');
    return (response.data || []).map(t => ({
        id: t.id,
        nome: t.name,
        tipoFinalidade: 'LPN',
        zplCodigo: t.zplContent,
        larguraMm: t.widthMm,
        alturaMm: t.heightMm,
        padrao: true
    }));
};

export const salvarTemplate = async (dados) => {
    const payload = {
        name: dados.nome,
        zplContent: dados.zplCodigo,
        widthMm: parseInt(dados.larguraMm, 10) || 100,
        heightMm: parseInt(dados.alturaMm, 10) || 150
    };
    const response = await api.post('/api/printing/templates', payload);
    return response.data;
};

export const excluirTemplate = async () => { };
export const getFilaImpressao = async () => ({ content: [] });
export const getDebugZpl = async () => "";
export const imprimirLpn = async () => { };