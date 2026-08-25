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
            empresas: [], // Lista de empresas que o usuário tem acesso

            setTokens: (accessToken, refreshToken) => {
                try {
                    const decoded = jwtDecode(accessToken);
                    const allowedCompanies = decoded.companies ? decoded.companies.split(',').filter(Boolean) : [];

                    set({
                        token: accessToken,
                        refreshToken: refreshToken,
                        user: {
                            id: decoded.sub,
                            nome: decoded.name || decoded.email,
                            email: decoded.email,
                            isMaster: decoded.isMaster === "True",
                            role: decoded.isMaster === "True" ? 'ADMIN' : 'USER',
                            companies: allowedCompanies
                        }
                    });
                } catch (error) {
                    console.error("Erro ao decodificar token", error);
                    get().logout();
                }
            },

            setEmpresas: (empresas) => set({ empresas }),

            setCompanyId: (id) => set({ companyId: id }),

            logout: () => set({ token: null, refreshToken: null, companyId: null, user: null, empresas: [] }),

            isAuthenticated: () => !!get().token,
        }),
        {
            name: 'corewms-auth-storage', // Nome da chave no localStorage
        }
    )
);