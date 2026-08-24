import api from './api';

// --- USUÁRIOS ---
export const getUsuarios = async () => {
    const response = await api.get('/api/users');
    return (response.data || []).map(u => ({
        id: u.id,
        nome: u.name,
        login: u.email,
        email: u.email,
        adminMaster: u.isMaster,
        ativo: true
    }));
};

export const getUsuarioById = async (id) => {
    const usuarios = await getUsuarios();
    return usuarios.find(u => u.id === id) || { id, nome: '', login: '', email: '', ativo: true };
};

export const salvarUsuario = async (dados) => {
    if (dados.id) {
        const payload = { name: dados.nome, email: dados.email };
        const response = await api.put(`/api/users/${dados.id}`, payload);
        return response.data;
    } else {
        const payload = { name: dados.nome, email: dados.email, password: dados.senha };
        const response = await api.post('/api/users', payload);
        return response.data;
    }
};

export const excluirUsuario = async (id) => {
    await api.delete(`/api/users/${id}`);
};

// --- PERFIS (ROLES) ---
export const getPerfis = async () => {
    const response = await api.get('/api/roles');
    return (response.data || []).map(r => ({
        id: r.id,
        nome: r.name,
        descricao: r.name,
        permissoes: []
    }));
};

export const getPerfisDaEmpresa = async () => {
    return await getPerfis();
};

export const salvarPerfil = async (perfil) => {
    if (perfil.id) {
        const response = await api.put(`/api/roles/${perfil.id}`, { name: perfil.nome });
        return response.data;
    } else {
        const response = await api.post('/api/roles', { name: perfil.nome });
        return response.data;
    }
};

export const excluirPerfil = async (id) => {
    await api.delete(`/api/roles/${id}`);
};

// --- VÍNCULOS USUÁRIO <-> EMPRESA ---
export const getEmpresasDoUsuario = async () => {
    const response = await api.get('/api/companies');
    return (response.data || []).map(c => ({
        id: c.id,
        razaoSocial: c.corporateName,
        cnpj: c.cnpj,
        perfil: 'Administrador'
    }));
};

export const vincularUsuarioEmpresa = async (usuarioId, empresaId, perfilId) => {
    await api.post(`/api/users/${usuarioId}/companies`, {
        companyId: empresaId,
        roleId: perfilId
    });
};

export const desvincularUsuarioEmpresa = async () => {
    // Vínculos são geridos via atribuição de perfil no .NET
};

export const getPermissoesDisponiveis = async () => {
    return {
        "CADASTROS": ["PRODUTO_CRIAR", "PRODUTO_EDITAR", "PARCEIRO_CRIAR", "PARCEIRO_EDITAR"],
        "SISTEMA": ["CONFIG_GERENCIAR", "USUARIO_CRIAR", "USUARIO_EDITAR"]
    };
};