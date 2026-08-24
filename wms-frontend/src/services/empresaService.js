import api from './api';

export const getMinhasEmpresas = async () => {
    const response = await api.get('/api/companies');
    return (response.data || []).map(c => ({
        id: c.id,
        tenantId: c.id,
        razaoSocial: c.corporateName,
        cnpj: c.cnpj,
        perfil: 'Administrador'
    }));
};

export const getTodasEmpresas = async () => {
    const response = await api.get('/api/companies');
    return (response.data || []).map(c => ({
        value: c.id,
        label: `${c.corporateName} (${c.cnpj})`,
        id: c.id,
        razaoSocial: c.corporateName,
        cnpj: c.cnpj
    }));
};

export const salvarEmpresa = async (dados) => {
    if (dados.id) {
        const response = await api.put(`/api/companies/${dados.id}`, dados);
        return response.data;
    } else {
        const response = await api.post('/api/companies', dados);
        return response.data;
    }
};

export const excluirEmpresa = async (id) => {
    await api.delete(`/api/companies/${id}`);
};