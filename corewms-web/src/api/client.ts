import axios from 'axios';
import { useAuthStore } from '@/store/useAuthStore';
import { toast } from 'sonner';

export const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
    headers: { 'Content-Type': 'application/json' },
});

// Interceptador de Request: Injeta JWT e X-Company-Id
api.interceptors.request.use((config) => {
    const { token, companyId } = useAuthStore.getState();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (companyId) config.headers['X-Company-Id'] = companyId;
    return config;
});

// Variáveis de controle para concorrência de renovação de Token
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

// Interceptador de Response: Trata o 401 e realiza Silent Refresh
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config;

        // Se der 401 e não for a própria tentativa de login/refresh (para evitar loop infinito)
        if (
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.url?.includes('/login') &&
            !originalRequest.url?.includes('/refresh')
        ) {

            // Se já estiver atualizando, coloca a requisição na fila de espera
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

            // Marca requisição atual para não tentar novamente e criar loop
            originalRequest._retry = true;
            isRefreshing = true;

            const authStore = useAuthStore.getState();
            const refreshToken = authStore.refreshToken;
            const email = authStore.user?.email;

            // Se não tem dados para renovar, expulsa
            if (!refreshToken || !email) {
                isRefreshing = false;
                authStore.logout();
                window.location.href = '/login';
                return Promise.reject(error);
            }

            try {
                // Realiza a chamada de refresh de forma crua (usando axios puro, sem o interceptor 'api')
                const { data } = await axios.post(`${api.defaults.baseURL}/api/identity/refresh`, {
                    email: email,
                    refreshToken: refreshToken
                });

                const newAccessToken = data.accessToken;
                const newRefreshToken = data.refreshToken;

                // Substitua o authStore.setSession por isto:
                useAuthStore.setState({
                    token: newAccessToken,
                    refreshToken: newRefreshToken
                });

                // Atualiza o token na requisição que falhou e processa as que estavam na fila
                originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
                processQueue(null, newAccessToken);

                // Refaz a requisição original de forma transparente
                return api(originalRequest);

            } catch (refreshError) {
                // Se o refresh falhar (ex: refreshToken expirou na API após 7 dias), rejeita a fila e desloga
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