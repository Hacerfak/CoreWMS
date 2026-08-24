import api from './api';

// Consulta Geral (Dashboard de Estoque)
export const getEstoqueDetalhado = async () => {
    const response = await api.get('/api/estoque/detalhado');
    return response.data;
};

// Saldo Consolidado por Produto
export const getSaldoProduto = async (produtoId) => {
    const response = await api.get(`/api/estoque/produto/${produtoId}/total`);
    return response.data;
};

// Processo de Armazenagem (Put-away)
export const armazenarLpn = async (lpn, localDestinoId) => {
    const payload = {
        lpn: lpn,
        localDestinoId: localDestinoId
    };
    await api.post('/api/estoque/armazenar', payload);
};

// Movimentação Manual (Ajustes)
export const movimentarEstoque = async (dados) => {
    await api.post('/api/estoque/movimentar', dados);
};