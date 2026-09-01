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

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config;

        // -------------------------------------------------------------------
        // 1. TRATAMENTO DE PERMISSÕES ALTERADAS EM TEMPO REAL (HTTP 403)
        // -------------------------------------------------------------------
        if (error.response?.status === 403) {
            toast.warning('Atenção: Suas permissões foram alteradas pelo administrador.');

            const authStore = useAuthStore.getState();

            // Busca as permissões atualizadas silenciosamente
            try {
                const { data: novasPermissoes } = await axios.get(`${api.defaults.baseURL}/api/users/me/permissions`, {
                    headers: {
                        Authorization: `Bearer ${authStore.token}`,
                        'X-Company-Id': authStore.companyId
                    }
                });

                // Atualiza o Zustand para que os menus reajam instantaneamente
                useAuthStore.setState({ permissions: novasPermissoes });

                // Joga o usuário para o dashboard, saindo da tela que ele perdeu acesso
                window.location.href = '/dashboard';
            } catch (err) {
                // Se der erro ao buscar novas permissões, manda escolher a empresa novamente
                window.location.href = '/selecao-empresa';
            }

            return Promise.reject(error);
        }

        // -------------------------------------------------------------------
        // 2. TRATAMENTO DE RENOVAÇÃO DE SESSÃO (HTTP 401)
        // -------------------------------------------------------------------
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/login') &&
            !originalRequest.url?.includes('/refresh')
        ) {

            if (isRefreshing) {
                return new Promise(function (resolve, reject) {
                    failedQueue.push({ resolve, reject });
                })
                    .then(token => {
                        originalRequest.headers['Authorization'] = 'Bearer ' + token;
                        return api(originalRequest);
                    })
                    .catch(err => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const authStore = useAuthStore.getState();
            const refreshToken = authStore.refreshToken;
            const email = authStore.user?.email;

            if (!refreshToken || !email) {
                isRefreshing = false;
                authStore.logout();
                window.location.href = '/login';
                return Promise.reject(error);
            }

            try {
                const { data } = await axios.post(`${api.defaults.baseURL}/api/identity/refresh`, {
                    email: email,
                    refreshToken: refreshToken
                });

                const newAccessToken = data.accessToken;
                const newRefreshToken = data.refreshToken;

                useAuthStore.setState({
                    token: newAccessToken,
                    refreshToken: newRefreshToken
                });

                originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                processQueue(null, newAccessToken);

                return api(originalRequest);

            } catch (refreshError) {
                processQueue(refreshError, null);
                toast.error('Sessão expirada por inatividade. Faça login novamente.');
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