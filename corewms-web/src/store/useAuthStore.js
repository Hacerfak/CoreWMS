import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { jwtDecode } from 'jwt-decode';

export const useAuthStore = create(
    persist(
        (set, get) => ({
            token: null,
            refreshToken: null,
            companyId: null,
            user: null,
            empresas: [],
            setTokens: (token, refreshToken) => {
                try {
                    const decoded = jwtDecode(token);
                    set({
                        token, refreshToken,
                        user: { id: decoded.sub, nome: decoded.name || decoded.email, role: decoded.isMaster === "True" ? 'ADMIN' : 'USER' }
                    });
                } catch { get().logout(); }
            },
            setEmpresas: (empresas) => set({ empresas }),
            setCompanyId: (id) => set({ companyId: id }),
            logout: () => set({ token: null, refreshToken: null, companyId: null, user: null, empresas: [] }),
            isAuthenticated: () => !!get().token,
        }),
        { name: 'corewms-auth' }
    )
);