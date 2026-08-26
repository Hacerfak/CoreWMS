import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';

export interface User {
    id: string;
    nome: string;
    email?: string;
    role?: string; // <- Apenas o role, sem isMaster!
}

export interface Empresa {
    id: string;
    corporateName: string;
    tradeName?: string | null;
    cnpj: string;
    [key: string]: unknown;
}

interface CustomJwtPayload {
    sub: string;
    name?: string;
    email?: string;
    isMaster?: string; // Mantemos aqui pois vem de dentro do JWT
    [key: string]: unknown;
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    companyId: string | null;
    user: User | null;
    empresas: Empresa[];
    permissions: string[];
    setAuth: (payload: { token: string; user: User; empresas?: Empresa[], permissions?: string[] }) => void;
    setPermissions: (permissions: string[]) => void;
    setTokens: (token: string, refreshToken?: string | null) => void;
    setEmpresas: (empresas: Empresa[]) => void;
    setCompanyId: (id: string | null) => void;
    logout: () => void;
    isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            companyId: null,
            user: null,
            empresas: [],
            permissions: [],
            setAuth: ({ token, user, empresas = [], permissions = [] }) => {
                set({ token, user, empresas, permissions });
            },
            setPermissions: (permissions: string[]) => set({ permissions }),

            setTokens: (token: string, refreshToken: string | null = null) => {
                try {
                    const decoded = jwtDecode<CustomJwtPayload>(token);

                    set({
                        token,
                        refreshToken,
                        user: {
                            id: decoded.sub,
                            nome: decoded.name || decoded.email || 'Usuário',
                            email: decoded.email,
                            // Transforma a claim do JWT no mesmo padrão da API
                            role: decoded.isMaster === 'True' ? 'ADMIN' : 'USER',
                        },
                    });
                } catch {
                    get().logout();
                }
            },

            setEmpresas: (empresas: Empresa[]) => set({ empresas }),
            setCompanyId: (id: string | null) => set({ companyId: id }),
            logout: () => set({ token: null, refreshToken: null, companyId: null, user: null, empresas: [], permissions: [] }),
            isAuthenticated: () => !!get().token,
        }),
        { name: 'corewms-auth' }
    )
);