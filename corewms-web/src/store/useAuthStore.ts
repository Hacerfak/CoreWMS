import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
    id: string;
    nome: string;
    email: string;
    isMaster: boolean;
    role?: string;
}

export interface Empresa {
    id: string;
    corporateName: string;
    tradeName?: string | null;
    cnpj: string;
}

interface AuthState {
    token: string | null;
    refreshToken: string | null;
    companyId: string | null;
    user: User | null;
    empresas: Empresa[];
    permissions: string[];

    setTokens: (token: string, refreshToken?: string | null) => void;
    setUserData: (payload: { user: User; empresas: Empresa[]; permissions: string[] }) => void;
    setPermissions: (permissions: string[]) => void;
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

            setTokens: (token: string, refreshToken: string | null = null) => {
                set({ token, refreshToken });
            },

            setUserData: ({ user, empresas, permissions }) => {
                set({
                    user,
                    empresas,
                    permissions,
                });
            },

            setPermissions: (permissions: string[]) => set({ permissions }),
            setCompanyId: (id: string | null) => set({ companyId: id }),

            logout: () => set({
                token: null,
                refreshToken: null,
                companyId: null,
                user: null,
                empresas: [],
                permissions: []
            }),

            isAuthenticated: () => !!get().token,
        }),
        { name: 'corewms-auth' }
    )
);