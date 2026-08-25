import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
    const { token, companyId } = useAuthStore.getState();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (companyId) config.headers['X-Company-Id'] = companyId;
    return config;
});

api.interceptors.response.use(
    (res) => res,
    (error) => {
        if (error.response?.status === 401 && !error.config.url.includes('/login')) {
            toast.error('Sessão expirada. Faça login novamente.');
            useAuthStore.getState().logout();
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);