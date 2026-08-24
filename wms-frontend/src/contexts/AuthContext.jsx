import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('corewms_user');
        return saved ? JSON.parse(saved) : null;
    });
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const processToken = useCallback((token) => {
        if (!token) return null;
        try {
            const decoded = jwtDecode(token);
            if (decoded.exp * 1000 < Date.now()) return null;

            const allowedCompanies = decoded.companies ? decoded.companies.split(',').filter(Boolean) : [];
            return {
                id: decoded.sub,
                nome: decoded.name || decoded.email,
                login: decoded.email,
                email: decoded.email,
                isMaster: decoded.isMaster === "True",
                role: decoded.isMaster === "True" ? 'ADMIN' : 'USER',
                companies: allowedCompanies
            };
        } catch (error) {
            return null;
        }
    }, []);

    const loadUserCompanies = useCallback(async () => {
        try {
            const response = await api.get('/api/companies');
            const list = (response.data || []).map(c => ({
                id: c.id,
                tenantId: c.id,
                razaoSocial: c.corporateName,
                cnpj: c.cnpj,
                perfil: 'Administrador Master'
            }));
            setEmpresas(list);
            return list;
        } catch (error) {
            setEmpresas([]);
            return [];
        }
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('corewms_access_token');
        if (token) {
            const userData = processToken(token);
            if (userData) {
                setUser(userData);
                localStorage.setItem('corewms_user', JSON.stringify(userData));
                loadUserCompanies();
            } else {
                logout();
            }
        } else {
            setUser(null);
        }
        setLoading(false);
    }, [processToken, loadUserCompanies]);

    const login = async (email, password) => {
        const response = await api.post('/api/identity/login', { email, password });

        // Suporta 'accessToken' ou 'token' retornados pela API
        const accessToken = response.data.accessToken || response.data.token;
        const refreshToken = response.data.refreshToken;

        if (!accessToken) {
            throw new Error("Resposta da API não contém um token de acesso válido.");
        }

        localStorage.setItem('corewms_access_token', accessToken);
        if (refreshToken) {
            localStorage.setItem('corewms_refresh_token', refreshToken);
        }

        const userData = processToken(accessToken);
        if (!userData) {
            throw new Error("Não foi possível decodificar as permissões do token.");
        }

        localStorage.setItem('corewms_user', JSON.stringify(userData));
        setUser(userData);

        const minhasEmpresas = await loadUserCompanies();

        if (minhasEmpresas.length > 0 && !localStorage.getItem('corewms_company_id')) {
            localStorage.setItem('corewms_company_id', minhasEmpresas[0].id);
        }

        return { userData, empresas: minhasEmpresas };
    };

    const selecionarEmpresa = (companyId) => {
        localStorage.setItem('corewms_company_id', companyId);
        setUser(prev => prev ? ({ ...prev, tenantId: companyId }) : null);
        return true;
    };

    const logout = () => {
        localStorage.removeItem('corewms_access_token');
        localStorage.removeItem('corewms_refresh_token');
        localStorage.removeItem('corewms_company_id');
        localStorage.removeItem('corewms_user');
        setUser(null);
        setEmpresas([]);
        navigate('/login');
    };

    const userCan = () => true;

    return (
        <AuthContext.Provider value={{
            authenticated: !!user,
            user,
            empresas,
            login,
            logout,
            loading,
            selecionarEmpresa,
            switchTenant: selecionarEmpresa,
            refreshUserCompanies: loadUserCompanies,
            userCan
        }}>
            {children}
        </AuthContext.Provider>
    );
};