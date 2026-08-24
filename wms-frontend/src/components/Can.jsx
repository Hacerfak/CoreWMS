import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

/**
 * Componente de Controle de Acesso (RBAC)
 * @param {string | string[]} permissions - Uma permissão ou array de permissões necessárias (Lógica OR)
 * @param {ReactNode} children - O que será renderizado se tiver permissão
 * @param {ReactNode} elseShow - (Opcional) O que mostrar caso NÃO tenha permissão
 */
const Can = ({ permissions, children, elseShow = null }) => {
    const { userCan } = useContext(AuthContext);

    // Se não passar nenhuma permissão, assume que é público ou erro de dev, libera render (ou bloqueia, dependendo da sua política)
    if (!permissions) return children;

    // Normaliza para array
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];

    // Verifica se tem ALGUMA das permissões (OR)
    // Se o usuário for ADMIN, o userCan já retorna true lá no Context
    const hasPermission = requiredPermissions.some(perm => userCan(perm));

    if (hasPermission) {
        return children;
    }

    return elseShow;
};

export default Can;