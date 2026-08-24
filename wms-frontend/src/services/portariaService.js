import api from './api';

// --- TURNOS ---
export const getTurnos = async () => {
    const response = await api.get('/api/portaria/turnos');
    return response.data;
};

export const salvarTurno = async (dados) => {
    // O backend usa o mesmo endpoint POST para criar/salvar
    const response = await api.post('/api/portaria/turnos', dados);
    return response.data;
};

export const excluirTurno = async (id) => {
    await api.delete(`/api/portaria/turnos/${id}`);
};

// --- AGENDA ---
export const getAgenda = async (data) => {
    // data deve ser YYYY-MM-DD
    const response = await api.get(`/api/portaria/agenda?data=${data}`);
    return response.data;
};

export const criarAgendamento = async (dados) => {
    const response = await api.post('/api/portaria/agenda', dados);
    return response.data;
};

export const vincularXmlAgendamento = async (id, file) => {
    const formData = new FormData();
    formData.append('file', file);
    await api.post(`/api/portaria/agenda/${id}/vincular-xml`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
};

export const cancelarAgendamento = async (id) => {
    await api.post(`/api/portaria/agenda/${id}/cancelar`);
};

export const marcarNoShow = async (id) => {
    await api.post(`/api/portaria/agenda/${id}/no-show`);
};

export const excluirAgendamento = async (id) => {
    await api.delete(`/api/portaria/agenda/${id}`);
};

export const getSaidasPendentes = async () => {
    const response = await api.get('/api/portaria/solicitacoes-saida-pendentes');
    return response.data;
};

// --- OPERAÇÃO (PÁTIO) ---
export const getPatio = async () => {
    const response = await api.get('/api/portaria/patio');
    return response.data;
};

export const realizarCheckin = async (codigoReserva, dados) => {
    // dados: { placa, motorista, cpf }
    const params = new URLSearchParams(dados).toString();
    const response = await api.post(`/api/portaria/checkin/${codigoReserva}?${params}`);
    return response.data;
};

export const realizarCheckout = async (codigoReserva, assinaturaFile) => {
    const formData = new FormData();
    if (assinaturaFile) {
        formData.append('assinatura', assinaturaFile);
    }
    const response = await api.post(`/api/portaria/checkout/${codigoReserva}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const encostarVeiculo = async (agendamentoId, docaId) => {
    // Se docaId for nulo, tenta usar a doca já atribuída no agendamento
    const url = docaId
        ? `/api/portaria/operacao/${agendamentoId}/encostar?docaId=${docaId}`
        : `/api/portaria/operacao/${agendamentoId}/encostar`;

    await api.post(url);
};