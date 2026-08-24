import api from './api';

export const getAuditLogs = async (filtros, page = 0, size = 20) => {
    const params = {
        Page: page + 1,
        PageSize: size
    };

    if (filtros.entidade) params.EntityName = filtros.entidade;
    if (filtros.usuario) params.UserId = filtros.usuario;
    if (filtros.inicio) params.StartDate = filtros.inicio;
    if (filtros.fim) params.EndDate = filtros.fim;

    const response = await api.get('/api/audit-logs', { params });
    const data = response.data || {};

    const items = (data.items || data.content || []).map(log => ({
        id: log.id,
        usuario: log.userId || 'Sistema',
        dataHora: log.timestamp,
        ipOrigem: '127.0.0.1',
        evento: log.action ? log.action.toUpperCase() : 'INFO',
        entidade: log.entityName,
        entidadeId: log.entityId,
        dados: log.changes ? JSON.stringify(log.changes) : null
    }));

    return {
        content: items,
        totalPages: data.totalPages || 1,
        totalElements: data.totalCount || items.length
    };
};