import api from './api';

// Gera uma LPN vazia para iniciar a montagem
export const gerarLpnVazia = async (formatoId, quantidade = 1, solicitacaoId) => {
    const response = await api.post('/api/estoque/lpns/gerar-vazias', {
        quantidade,
        formatoId,
        solicitacaoId,
        docaId
    });
    return response.data; // Retorna array de códigos ex: ["LPN-12345"]
};

// Adiciona item em uma LPN existente (EM_MONTAGEM)
export const adicionarItemLpn = async (codigoLpn, item) => {
    // item: { sku, quantidade, lote, validade, ... }
    await api.post(`/api/estoque/lpns/${codigoLpn}/itens`, item);
};

// Fecha a LPN para disponibilizar para armazenagem
export const fecharLpn = async (codigoLpn) => {
    await api.post(`/api/estoque/lpns/${codigoLpn}/fechar`);
};

// Busca dados da LPN (para ver o conteúdo atual e status)
export const getLpnPorCodigo = async (codigo) => {
    const response = await api.get(`/api/estoque/lpns/codigo/${codigo}`);
    return response.data;
};