import api from './api';

export const getProdutos = async (page = 0, size = 20) => {
    // A API retorna um objeto Page { content: [], totalElements: ... }
    const response = await api.get(`/api/produtos?page=${page}&size=${size}`);
    return response.data;
};

export const getProdutoById = async (id) => {
    const response = await api.get(`/api/produtos/${id}`);
    return response.data;
};

export const salvarProduto = async (dados) => {
    // Tratamento de tipos numéricos para evitar erro no Java
    const payload = { ...dados };
    if (payload.pesoBrutoKg) payload.pesoBrutoKg = parseFloat(payload.pesoBrutoKg);
    if (payload.valorUnitarioPadrao) payload.valorUnitarioPadrao = parseFloat(payload.valorUnitarioPadrao);
    if (payload.fatorConversao) payload.fatorConversao = parseInt(payload.fatorConversao);
    if (payload.fatorEmpilhamento) payload.fatorEmpilhamento = parseInt(payload.fatorEmpilhamento);

    if (dados.id) {
        await api.put(`/api/produtos/${dados.id}`, payload);
    } else {
        await api.post('/api/produtos', payload);
    }
};

export const excluirProduto = async (id) => {
    await api.delete(`/api/produtos/${id}`);
};