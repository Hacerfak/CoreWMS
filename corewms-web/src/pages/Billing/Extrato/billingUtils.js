// Utilitários de formatação e consolidação do módulo de faturamento

export const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';
    if (typeof dateValue === 'string') {
        const clean = dateValue.split('T')[0];
        const parts = clean.split('-');
        if (parts.length === 3) {
            const [year, month, day] = parts;
            return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
        }
    }
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    } catch {
        return '-';
    }
};

export const formatNotesWithLocalTime = (notes) => {
    if (!notes) return '-';
    const match = notes.match(/(Atualizado|Recalculado) em (\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})(.*)/);
    if (match) {
        const [, action, day, month, year, hour, minute, rest] = match;
        const utcDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
        if (!isNaN(utcDate.getTime())) {
            const localStr = utcDate.toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            return `${action} em ${localStr}${rest || ''}`;
        }
    }
    return notes;
};

// Formatação padrão monetária (2 casas decimais)
export const formatCurrency = (val) => {
    const num = Number(val);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

// Formatação para Tarifas Unitárias e Alíquotas (Suporte até 10 casas decimais)
export const formatUnitRate = (val) => {
    const num = Number(val);
    if (isNaN(num)) return 'R$ 0,00';
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 10 })}`;
};

export const formatNumber = (val) => {
    const num = Number(val);
    return (isNaN(num) ? 0 : num).toLocaleString('pt-BR');
};

export const extractNfeNumber = (item) => {
    if (!item) return 'Estoque Consolidado';
    if (item.documentNumber && !item.documentNumber.includes('/') && item.documentNumber !== 'Estoque Consolidado') {
        return item.documentNumber.replace(/[^0-9]/g, '') || item.documentNumber;
    }
    const match = (item.description || '').match(/NF(?:-e)?\s*(?:Entrada)?\s*#?\s*(\d+)/i);
    if (match) return match[1];
    if (item.statementDataJson) {
        try {
            const parsed = JSON.parse(item.statementDataJson);
            const first = Array.isArray(parsed) ? parsed[0] : parsed;
            if (first?.NF_ENTRADA && !String(first.NF_ENTRADA).includes('/')) {
                return String(first.NF_ENTRADA).replace(/[^0-9]/g, '');
            }
        } catch { }
    }
    return item.documentNumber || 'Estoque Consolidado';
};

export const classifyService = (item) => {
    const desc = (item.description || item.serviceName || '').toLowerCase();
    const docType = (item.documentType || '').toLowerCase();
    if (desc.includes('ad-valorem') || desc.includes('seguro')) return 'ad_valorem';
    if (desc.includes('armazenagem') || desc.includes('storage') || desc.includes('estadia') || docType.includes('diária')) return 'storage';
    if (desc.includes('recebimento') || desc.includes('handling in') || desc.includes('entrada') || docType.includes('entrada')) return 'handling_in';
    if (desc.includes('expedição') || desc.includes('handling out') || desc.includes('separação') || desc.includes('stretch') || desc.includes('saída') || docType.includes('saída')) return 'handling_out';
    return 'other';
};

/**
 * Agrupa as linhas do extrato consolidando por TIPO DE EMBALAGEM.
 * Evita gerar um registro repetido para cada lote do mesmo tipo.
 * Para Ad-Valorem, extrai e calcula a Base de Cálculo em R$ (valor das mercadorias).
 */
export const aggregatePackagingRows = (statementJson, fallbackQty = 0, fallbackAmount = 0, isAdValorem = false) => {
    if (!statementJson) {
        const calculatedUnit = fallbackQty > 0 ? (fallbackAmount / fallbackQty) : fallbackAmount;
        return [{
            packagingCode: 'VOL',
            description: 'Volume Operacional',
            volumeCount: fallbackQty > 0 ? fallbackQty : 1,
            unitValue: calculatedUnit,
            baseCalculation: isAdValorem ? fallbackAmount : 0,
            totalValue: fallbackAmount
        }];
    }

    try {
        const parsed = JSON.parse(statementJson);
        const rows = Array.isArray(parsed) ? parsed : [parsed];
        const grouped = {};

        rows.forEach(r => {
            const code = (r.TIPO_VOLUME || r.PackagingCode || r.tipo_volume || 'VOL').toUpperCase().trim();
            const vol = Number(r.VOLUME ?? r.VolumeCount ?? r.volume ?? 1) || 1;
            const tot = Number(r.VALOR_TOTAL ?? r.VALOR_DIARIA ?? r.TotalValue ?? 0) || 0;
            let unit = Number(r.VALOR_UNITARIO ?? r.UnitValue ?? 0) || 0;

            let base = Number(r.BASE_CALCULO ?? r.BaseCalculo ?? r.VALOR_MERCADORIA ?? 0) || 0;
            // Se for Ad-Valorem e a base não veio explícita, calcula: Base = Total / Alíquota
            if (base === 0 && isAdValorem && unit > 0) {
                base = tot / unit;
            }

            if (unit === 0 && vol > 0 && tot > 0) {
                unit = tot / vol;
            }

            const desc = r.DESCRICAO_EMBALAGEM || r.DESCRICAO || (code === 'PLT' ? 'Palete' : (code === 'CX' ? 'Caixa' : (code === 'UN' ? 'Unidade' : 'Volume')));

            if (!grouped[code]) {
                grouped[code] = {
                    packagingCode: code,
                    description: desc,
                    volumeCount: 0,
                    unitValue: unit,
                    baseCalculation: 0,
                    totalValue: 0
                };
            }

            grouped[code].volumeCount += vol;
            grouped[code].totalValue += tot;
            grouped[code].baseCalculation += base;
            if (unit > 0) {
                grouped[code].unitValue = unit;
            }
        });

        return Object.values(grouped);
    } catch {
        return [{
            packagingCode: 'VOL',
            description: 'Volume Operacional',
            volumeCount: fallbackQty > 0 ? fallbackQty : 1,
            unitValue: fallbackAmount,
            baseCalculation: isAdValorem ? fallbackAmount : 0,
            totalValue: fallbackAmount
        }];
    }
};