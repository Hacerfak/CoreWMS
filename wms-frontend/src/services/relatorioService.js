import api from './api';

export const getOcupacao = async () => {
    const response = await api.get('/api/relatorios/ocupacao');
    return response.data; // Retorna Lista de OcupacaoDTO
};

export const getAcuracidade = async () => {
    const response = await api.get('/api/relatorios/acuracidade');
    return response.data; // Retorna Lista de AcuracidadeDTO
};

export const getAging = async (dias = 30) => {
    const response = await api.get(`/api/relatorios/aging?diasVencimento=${dias}`);
    return response.data; // Produtos vencendo em breve
};

export const getPosicaoEstoque = async () => {
    const response = await api.get('/api/relatorios/posicao-estoque');
    return response.data;
};