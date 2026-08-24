import axios from 'axios';
import { toast } from 'react-toastify';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
    baseURL: baseURL,
    headers: { 'Content-Type': 'application/json' }
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('corewms_access_token');
    const companyId = localStorage.getItem('corewms_company_id');

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    if (companyId) {
        config.headers['X-Company-Id'] = companyId;
    }
    return config;
});

api.interceptors.response.use(
    response => response,
    error => {
        if (!error.response) {
            toast.error("Sem conexão com o servidor da API.");
            return Promise.reject(error);
        }

        const { status, data } = error.response;

        if (status === 401 && !error.config.url.includes('/api/identity/login')) {
            toast.warning("Sessão expirada. Faça login novamente.");
        } else if (status === 403) {
            toast.error("Acesso negado para esta operação.");
        } else if (data && data.detail) {
            toast.error(data.detail);
        } else if (data && data.message) {
            toast.error(data.message);
        }

        return Promise.reject(error);
    }
);

export default api;