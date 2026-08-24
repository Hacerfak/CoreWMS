import api from './api';

// --- ARMAZÉNS ---
export const getArmazens = async () => {
    const response = await api.get('/api/mapeamento/armazens');
    return response.data;
};

export const salvarArmazem = async (dados) => {
    // Upsert (Create or Update)
    if (dados.id) {
        // Se tivesse PUT implementado no back: await api.put(...)
        // Como o controller unificado simplificado usa POST para save/update (via JPA .save()), mantemos POST por enquanto
        // Idealmente: Implementar PUT no backend separado. 
        // Vamos assumir que você vai usar o POST que o JPA .save() atualiza se tiver ID.
        await api.post('/api/mapeamento/armazens', dados);
    } else {
        await api.post('/api/mapeamento/armazens', dados);
    }
};

// --- ÁREAS ---
export const getAreas = async (armazemId) => {
    if (!armazemId) return [];
    const response = await api.get(`/api/mapeamento/areas/${armazemId}`);
    return response.data;
};

export const salvarArea = async (dados) => {
    await api.post('/api/mapeamento/areas', dados);
};

// --- LOCAIS / POSIÇÕES ---
export const getLocais = async (areaId) => {
    if (!areaId) return [];
    const response = await api.get(`/api/mapeamento/locais/${areaId}`);
    return response.data;
};

export const salvarLocal = async (dados) => {
    const payload = { ...dados };
    // Garante tipos numéricos
    if (payload.capacidadePesoKg) payload.capacidadePesoKg = parseFloat(payload.capacidadePesoKg);
    if (payload.capacidadeLpn) payload.capacidadeLpn = parseInt(payload.capacidadeLpn);

    await api.post('/api/mapeamento/locais', payload);
};

// Exclusão (Genérica para o MVP)
export const excluirItem = async (tipo, id) => {
    // tipo = 'armazens', 'areas', 'locais'
    await api.delete(`/api/mapeamento/${tipo}/${id}`);
};

// --- UTILITÁRIOS ---
export const buscarLocalPorCodigo = async (enderecoCompleto) => {
    // Codifica a barra (/) para evitar erro na URL se houver
    const encoded = encodeURIComponent(enderecoCompleto);
    const response = await api.get(`/api/mapeamento/scan/${encoded}`);
    return response.data;
};