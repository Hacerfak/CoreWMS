import { useAuthStore } from '@/store/useAuthStore';

export function useHasPermission(
    permission?: string | string[] | null,
    mode: 'any' | 'all' = 'any'
): boolean {
    const user = useAuthStore((s) => s.user);
    const permissions = useAuthStore((s) => s.permissions) || [];

    // Se não exige permissão específica, libera o acesso
    if (!permission || (Array.isArray(permission) && permission.length === 0)) {
        return true;
    }

    // Se for Master, Admin ou possuir a permissão curinga '*', concede acesso total
    if (user?.isMaster || user?.role === 'ADMIN' || permissions.includes('*')) {
        return true;
    }

    if (Array.isArray(permission)) {
        return mode === 'all'
            ? permission.every((p) => permissions.includes(p))
            : permission.some((p) => permissions.includes(p));
    }

    return permissions.includes(permission);
}