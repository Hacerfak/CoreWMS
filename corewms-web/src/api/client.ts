import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    headers: { 'Content-Type': 'application/json' },
});

// 1. Interceptor de Requisição: Injeta o Token e Empresa Atual
api.interceptors.request.use((config) => {
    const { token, companyId } = useAuthStore.getState();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (companyId) config.headers['X-Company-Id'] = companyId;
    return config;
});

// Controle de Fila Anti-Race Condition para Refresh Tokens
let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token as string);
        }
    });
    failedQueue = [];
};

// 2. Interceptor de Resposta: Trata HTTP 403 e Renovação de Token no HTTP 401
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config;

        // TRATAMENTO DE PERMISSÕES ALTERADAS (HTTP 403)
        if (error.response?.status === 403) {
            toast.warning('Atenção: Suas permissões foram alteradas pelo administrador.');
            const authStore = useAuthStore.getState();

            try {
                const baseURL = (api.defaults.baseURL || '').replace(/\/$/, '');
                const { data: novasPermissoes } = await axios.get(`${baseURL}/api/users/me/permissions`, {
                    headers: {
                        Authorization: `Bearer ${authStore.token}`,
                        'X-Company-Id': authStore.companyId
                    }
                });
                useAuthStore.setState({ permissions: novasPermissoes });
                window.location.href = '/dashboard';
            } catch (err) {
                window.location.href = '/selecao-empresa';
            }
            return Promise.reject(error);
        }

        // TRATAMENTO DE RENOVAÇÃO DE SESSÃO (HTTP 401)
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/login') &&
            !originalRequest.url?.includes('/refresh')
        ) {
            // Se já existe uma renovação em andamento, adiciona a requisição na fila de espera
            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                    .then(token => {
                        if (originalRequest.headers) {
                            originalRequest.headers['Authorization'] = `Bearer ${token}`;
                        }
                        return api(originalRequest);
                    })
                    .catch(err => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const authStore = useAuthStore.getState();
            const refreshToken = authStore.refreshToken;

            // Se não houver refresh token salvo, realiza o logout
            if (!refreshToken) {
                isRefreshing = false;
                authStore.logout();
                window.location.href = '/login';
                return Promise.reject(error);
            }

            try {
                const baseURL = (api.defaults.baseURL || '').replace(/\/$/, '');

                // Chamada direta via axios puro para evitar disparar o interceptor em loop
                const { data } = await axios.post(`${baseURL}/api/identity/refresh`, {
                    refreshToken: refreshToken
                });

                const newAccessToken = data?.accessToken || data?.data?.accessToken;
                const newRefreshToken = data?.refreshToken || data?.data?.refreshToken;

                if (!newAccessToken) {
                    throw new Error("A API não retornou um token válido.");
                }

                // Atualiza o estado Zustand com os novos tokens
                authStore.setTokens(newAccessToken, newRefreshToken);

                // Re-injeta o token renovado nos cabeçalhos da requisição original
                if (originalRequest.headers) {
                    originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                }

                // Libera todas as requisições que estavam aguardando na fila
                processQueue(null, newAccessToken);

                return api(originalRequest);

            } catch (refreshError) {
                processQueue(refreshError, null);
                toast.error('Sessão expirada por segurança. Faça login novamente.');
                authStore.logout();
                window.location.href = '/login';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);