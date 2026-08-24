import api from './api';

export const getRecebimentos = async () => {
    const response = await api.get('/api/recebimentos');
    return response.data;
};

export const getRecebimentoById = async (id) => {
    const response = await api.get(`/api/recebimentos/${id}`);
    return response.data;
};

export const deleteRecebimento = async (id) => {
    await api.delete(`/api/recebimentos/${id}`);
};

export const conferirProduto = async (recebimentoId, sku, quantidade, dadosExtras = {}, formatoId) => {
    const payload = {
        solicitacaoId: Number(recebimentoId),
        sku: sku,

        // --- CORREÇÃO: Nomes devem bater com o DTO Java (GerarLpnMassaRequest) ---
        qtdPorVolume: Number(quantidade),       // Antes era: quantidadePorVolume
        qtdVolumes: Number(dadosExtras.volumes || 1), // Antes era: quantidadeDeVolumes

        lote: dadosExtras.lote || null,
        dataValidade: dadosExtras.validade || null,
        numeroSerie: dadosExtras.serial || null,
        formatoId: formatoId
    };

    const response = await api.post(`/api/recebimentos/${recebimentoId}/conferencia-massa`, payload);
    return response.data;
};

export const finalizarConferencia = async (id, stageId) => {
    // Agora enviamos o stageId como Query Param
    const response = await api.post(`/api/recebimentos/${id}/finalizar?stageId=${stageId}`);
    return response.data;
};

export const cancelarConferencia = async (id) => {
    await api.post(`/api/recebimentos/${id}/cancelar`);
};

export const getVolumesDoItem = async (recebimentoId, produtoId) => {
    // Endpoint para buscar LPNs já conferidas daquele produto
    // Caso não tenha endpoint específico, usamos o geral de LPNs filtrando no front (menos performático)
    // ou assumimos que o backend tem um filtro. Vamos usar o endpoint de LPNs da solicitação.
    const response = await api.get(`/api/recebimentos/${recebimentoId}/lpns`);
    // Filtra no front por enquanto se o backend não tiver filtro por produto
    return response.data.filter(lpn => lpn.itens.some(i => i.produto.id === produtoId));
};

export const getLpnsDaSolicitacao = async (recebimentoId) => {
    const response = await api.get(`/api/recebimentos/${recebimentoId}/lpns`);
    return response.data;
};

export const estornarLpn = async (recebimentoId, lpnId) => {
    await api.delete(`/api/recebimentos/${recebimentoId}/lpns/${lpnId}`);
};

export const getDivergenciasPendentes = async () => {
    const response = await api.get('/api/recebimentos/divergencias');
    return response.data;
};

export const resolverDivergencia = async (id, aceitar, observacao) => {
    const params = new URLSearchParams();
    params.append('aceitar', aceitar);
    params.append('observacao', observacao);

    await api.post(`/api/recebimentos/divergencias/${id}/resolver?${params.toString()}`);
};

export const getProgressoRecebimento = async (id) => {
    const response = await api.get(`/api/recebimentos/${id}/progresso`);
    return response.data;
};

export const atribuirDoca = async (id, docaId) => {
    await api.put(`/api/recebimentos/${id}/atribuir-doca?docaId=${docaId}`);
};

// Substitua/Adicione estes métodos
export const resetarConferencia = async (id) => {
    await api.post(`/api/recebimentos/${id}/resetar`);
};

export const excluirSolicitacao = async (id) => {
    await api.delete(`/api/recebimentos/${id}`);
};