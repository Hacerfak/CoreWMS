import api from './api';

export const getEmpresaConfig = async () => {
    const response = await api.get('/api/companies');
    const empresaAtivaId = localStorage.getItem('corewms_company_id');
    const lista = response.data || [];
    const empresa = lista.find(c => c.id === empresaAtivaId) || lista[0] || {};

    return {
        id: empresa.id,
        razaoSocial: empresa.corporateName || '',
        nomeFantasia: empresa.tradeName || '',
        cnpj: empresa.cnpj || '',
        uf: empresa.state || 'SP'
    };
};

export const updateEmpresaConfig = async (dados) => {
    const response = await api.put(`/api/companies/${dados.id}`, {
        id: dados.id,
        corporateName: dados.razaoSocial,
        tradeName: dados.nomeFantasia,
        state: dados.uf
    });
    return response.data;
};

export const uploadCertificadoConfig = async (file, senha, uf = 'SP') => {
    const formData = new FormData();
    formData.append('certificateFile', file);
    formData.append('certificatePassword', senha);
    formData.append('uf', uf);

    const response = await api.post('/api/companies', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
};

export const consultarCnpjSefaz = async (uf, cnpj) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const response = await api.post(`/api/customers/consult-sefaz/${cnpjLimpo}?uf=${uf}`);
    const data = response.data;

    return {
        razaoSocial: data.corporateName,
        nomeFantasia: data.tradeName,
        ie: data.stateRegistration,
        regimeTributario: String(data.crt || 1),
        cep: data.zipCode,
        logradouro: data.street,
        numero: data.number,
        complemento: data.complement,
        bairro: data.neighborhood,
        cidade: data.cityName,
        uf: data.state
    };
};