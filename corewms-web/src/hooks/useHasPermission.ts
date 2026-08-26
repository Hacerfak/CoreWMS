import { useAuthStore } from '@/store/useAuthStore';

export function useHasPermission(permission?: string | null): boolean {
    const user = useAuthStore((s) => s.user);
    const permissions = useAuthStore((s) => s.permissions) || [];

    if (!permission) return true;

    // Se for ADMIN, tem acesso livre (Super Privilégio)
    if (user?.role === 'ADMIN') return true;

    // Se não for, busca a permissão exata da empresa selecionada
    return permissions.includes(permission);
}