import api from './api';

// Busca todas as configurações globais (Tabela tb_sistema_config)
export const getConfiguracoes = async () => {
    const response = await api.get('/api/sistema-config');
    return response.data;
};

// Busca uma configuração específica (Ex: para validações rápidas)
export const getConfiguracaoValor = async (chave) => {
    try {
        const response = await api.get(`/api/sistema-config/valor/${chave}`);
        return response.data;
    } catch (error) {
        return null;
    }
};

// Atualiza uma configuração específica
export const updateConfiguracao = async (chave, valor) => {
    const response = await api.put(`/api/sistema-config/${chave}`, { valor });
    return response.data;
};

export const checkExibirQtdRecebimento = async (recebimentoId) => {
    if (!recebimentoId) return true;
    try {
        const response = await api.get(`/api/recebimentos/${recebimentoId}/config-conferencia`);
        return response.data; // Retorna boolean (true = exibe, false = cego)
    } catch (error) {
        console.error("Erro ao checar config conferencia", error);
        return true; // Fallback seguro
    }
};