import api from './api';

// Realiza o Check-out (Carregamento) de um volume na doca
export const despacharVolume = async (codigoRastreio) => {
    // O backend retorna 200 OK se sucesso ou erro 400/404/500
    await api.post(`/api/expedicao/despachar/${codigoRastreio}`);
};

// (Opcional) Futuras funções de Picking entrariam aqui
export const getOndas = async () => {
    // Exemplo para expansão futura
    // const response = await api.get('/api/expedicao/ondas');
    // return response.data;
    return [];
};