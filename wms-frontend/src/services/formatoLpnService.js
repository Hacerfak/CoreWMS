import api from './api';

const BASE_URL = '/api/estoque/formatos-lpn';

export const getFormatos = async () => {
    const response = await api.get(BASE_URL);
    return response.data;
};

export const getFormatosAtivos = async () => {
    const response = await api.get(`${BASE_URL}/ativos`);
    return response.data;
};

export const salvarFormato = async (formato) => {
    const response = await api.post(BASE_URL, formato);
    return response.data;
};

export const alternarStatusFormato = async (id) => {
    await api.patch(`${BASE_URL}/${id}/status`);
};

export const excluirFormato = async (id) => {
    await api.delete(`${BASE_URL}/${id}`);
};