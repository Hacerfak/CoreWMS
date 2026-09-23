import { useAuthStore } from '@/store/useAuthStore';

export function useHasPermission(permission?: string | null): boolean {
    const user = useAuthStore((s) => s.user);
    const permissions = useAuthStore((s) => s.permissions) || [];

    // Se não exige permissão específica, libera o acesso
    if (!permission) return true;

    // Se for Master, Admin ou possuir a permissão curinga '*', concede acesso total
    if (user?.isMaster || user?.role === 'ADMIN' || permissions.includes('*')) {
        return true;
    }

    // Caso contrário, checa a permissão exata na empresa selecionada
    return permissions.includes(permission);
}