import api from './api';

// REFATORADO: Agora aceita um parametro de tipo opcional
// Se passar 'DOCA', traz todas as docas. Se passar areaId (número), mantém compatibilidade antiga (opcional)
// Mas recomendo usar métodos separados se a lógica for muito distinta.
// Aqui vamos focar na listagem global filtrada.

export const getLocalizacoes = async (tipo = null) => {
    let url = '/api/mapeamento/locais';
    if (tipo) {
        url += `?tipo=${tipo}`;
    }
    const response = await api.get(url);
    return response.data;
};

// Se você ainda usa a busca por Area ID na tela de Mapeamento, mantenha este:
export const getLocaisPorArea = async (areaId) => {
    const response = await api.get(`/api/mapeamento/locais/${areaId}`);
    return response.data;
};

export const salvarLocalizacao = async (dados) => {
    const payload = { ...dados };
    if (payload.capacidadePesoKg) payload.capacidadePesoKg = parseFloat(payload.capacidadePesoKg);

    if (dados.id) {
        await api.put(`/api/locais/${dados.id}`, payload);
    } else {
        await api.post('/api/locais', payload);
    }
};

export const excluirLocalizacao = async (id) => {
    await api.delete(`/api/locais/${id}`);
};