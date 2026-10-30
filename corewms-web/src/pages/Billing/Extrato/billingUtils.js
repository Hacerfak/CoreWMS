// Utilitários de formatação e consolidação do módulo de faturamento

export const formatDatePtBr = (dateValue) => {
    if (!dateValue) return '-';

    // 1. Se for apenas string de data sem hora (ex: "2026-10-31")
    if (typeof dateValue === 'string' && dateValue.length === 10 && dateValue.includes('-')) {
        const [year, month, day] = dateValue.split('-');
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    // 2. Se for uma data com horário zerado em UTC (ex: "2026-10-29T00:00:00.000Z")
    if (typeof dateValue === 'string' && (dateValue.includes('T00:00:00') || dateValue.includes(' 00:00:00'))) {
        const clean = dateValue.split('T')[0].split(' ')[0];
        const [year, month, day] = clean.split('-');
        return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
    }

    // 3. Para timestamps completos (ex: EndDate "2026-11-01T02:59:59.999Z")
    // Converte para a data civil no fuso horário do usuário (31/10/2026)
    try {
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) return '-';
        return d.toLocaleDateString('pt-BR');
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

    // 1. O DocumentNumber agora guarda sempre o número da NF-e de Entrada de Origem
    if (item.documentNumber && !item.documentNumber.includes('/') && item.documentNumber !== 'Estoque Consolidado') {
        const clean = item.documentNumber.replace(/[^0-9]/g, '');
        if (clean.length > 0) return clean;
    }

    // 2. Fallback de extração via JSON analítico da query
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

// Localize a função classifyService em billingUtils.js e substitua por:
export const classifyService = (item) => {
    const rawDesc = (item.description || item.serviceName || '').toLowerCase();
    const docType = (item.documentType || '').toLowerCase();

    // Remove hífens, sublinhados e espaços para unificar "advalorem", "ad-valorem" e "ad valorem"
    const cleanDesc = rawDesc.replace(/[\s-_]/g, '');

    if (cleanDesc.includes('advalorem') || rawDesc.includes('seguro') || rawDesc.includes('patrimonial')) {
        return 'ad_valorem';
    }

    if (rawDesc.includes('armazenagem') || rawDesc.includes('storage') || rawDesc.includes('estadia') || docType.includes('diária') || docType.includes('diaria')) {
        return 'storage';
    }

    if (rawDesc.includes('recebimento') || cleanDesc.includes('handlingin') || rawDesc.includes('entrada') || docType.includes('entrada')) {
        return 'handling_in';
    }

    if (rawDesc.includes('expedição') || rawDesc.includes('expedicao') || cleanDesc.includes('handlingout') || rawDesc.includes('separação') || rawDesc.includes('separacao') || rawDesc.includes('stretch') || rawDesc.includes('saída') || rawDesc.includes('saida') || docType.includes('saída')) {
        return 'handling_out';
    }

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