import axios from 'axios';
import { useAuthStore } from '../store/useAuthStore';
import { toast } from 'react-toastify';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    headers: {
        'Content-Type': 'application/json',
    },
});

// Interceptor de Requisição
api.interceptors.request.use((config) => {
    // Lê o estado global diretamente na memória
    const { token, companyId } = useAuthStore.getState();

    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    if (companyId) {
        config.headers['X-Company-Id'] = companyId;
    }

    return config;
});

// Interceptor de Resposta
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (!error.response) {
            toast.error("Sem conexão com o servidor da API.");
            return Promise.reject(error);
        }

        const { status, data } = error.response;

        if (status === 401 && !error.config.url.includes('/login')) {
            toast.warning("Sessão expirada. Faça login novamente.");
            useAuthStore.getState().logout();
            window.location.href = '/login';
        } else if (status === 403) {
            toast.error("Acesso negado para esta operação no ambiente atual.");
        } else if (data?.message) {
            toast.error(data.message);
        } else if (data?.detail) {
            toast.error(data.detail);
        }

        return Promise.reject(error);
    }
);  