import api from './api';

// Busca lista de Parceiros / Depositantes
export const getParceiros = async (search = '', onlyActive = true) => {
    const response = await api.get('/api/customers', {
        params: { search, onlyActive }
    });

    // Mapeia DTO do .NET para a estrutura esperada pela ParceiroList e pelos Combos
    return (response.data || []).map(c => ({
        id: c.id,
        nome: c.corporateName,
        nomeFantasia: c.tradeName || '',
        documento: c.cnpj,
        ie: c.stateRegistration || '',
        tipo: 'DEPOSITANTE',
        cidade: c.cityName || '',
        uf: c.state || '',
        ativo: c.isActive
    }));
};

// Busca detalhes do Parceiro por ID
export const getParceiroById = async (id) => {
    const response = await api.get('/api/customers');
    const customer = (response.data || []).find(c => c.id === id);
    if (!customer) throw new Error("Parceiro não encontrado.");

    // Preenche o estado do ParceiroForm.jsx
    return {
        id: customer.id,
        documento: customer.cnpj,
        nome: customer.corporateName,
        nomeFantasia: customer.tradeName || '',
        ie: customer.stateRegistration || '',
        tipo: 'DEPOSITANTE',
        crt: String(customer.crt || 1),
        cep: customer.zipCode || '',
        logradouro: customer.street || '',
        numero: customer.number || '',
        complemento: customer.complement || '',
        bairro: customer.neighborhood || '',
        cidade: customer.cityName || '',
        uf: customer.state || 'SP',
        telefone: customer.phone || '',
        email: customer.email || '',
        recebimentoCego: customer.autoApproveReceiving || false,
        padraoControlaLote: customer.requireBatchControl || false,
        padraoControlaValidade: customer.requireExpirationControl || false,
        padraoControlaSerie: customer.requireSerialControl || false,
        ativo: customer.isActive
    };
};

// Salva (Criação ou Edição)
export const salvarParceiro = async (form) => {
    const payload = {
        cnpj: form.documento ? form.documento.replace(/\D/g, '') : '',
        corporateName: form.nome,
        tradeName: form.nomeFantasia || null,
        stateRegistration: form.ie || null,
        municipalRegistration: null,
        crt: parseInt(form.crt, 10) || 1,
        street: form.logradouro || null,
        number: form.numero || null,
        complement: form.complemento || null,
        neighborhood: form.bairro || null,
        cityCode: 0,
        cityName: form.cidade || null,
        state: form.uf || 'SP',
        zipCode: form.cep ? form.cep.replace(/\D/g, '') : null,
        email: form.email || null,
        phone: form.telefone || null,
        requireBatchControl: !!form.padraoControlaLote,
        requireExpirationControl: !!form.padraoControlaValidade,
        requireSerialControl: !!form.padraoControlaSerie,
        allowNegativeStock: false,
        autoApproveReceiving: !!form.recebimentoCego
    };

    if (form.id) {
        const response = await api.put(`/api/customers/${form.id}`, payload);
        return response.data;
    } else {
        const response = await api.post(`/api/customers`, payload);
        return response.data;
    }
};

// Inativação / Exclusão
export const excluirParceiro = async (id) => {
    await api.delete(`/api/customers/${id}`);
};

// Consulta CNPJ na SEFAZ (Usa o Certificado da Empresa ativa via X-Company-Id)
export const consultarCnpjSefaz = async (uf, cnpj) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    const response = await api.post(`/api/customers/consult-sefaz/${cnpjLimpo}?uf=${uf}`);
    const data = response.data;

    // Traduz a resposta da SEFAZ para auto-completar o formulário existente
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

// Utilitário de busca de CEP
export const buscarEnderecoPorCep = async (cep) => {
    try {
        const cleanCep = cep.replace(/\D/g, '');
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        return await response.json();
    } catch (error) {
        return null;
    }
};