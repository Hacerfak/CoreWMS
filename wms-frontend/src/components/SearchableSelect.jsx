import { useState, useMemo } from 'react';
import { TextField, MenuItem, InputAdornment, ListSubheader, Typography, Box } from '@mui/material';
import { Search } from 'lucide-react';

const SearchableSelect = ({
    options = [],
    label,
    value,
    onChange,
    name,
    disabled,
    required,
    InputLabelProps,
    sx
}) => {
    const [searchText, setSearchText] = useState('');

    // Garante que options seja sempre um array para evitar quebras
    const safeOptions = Array.isArray(options) ? options : [];

    const filteredOptions = useMemo(() => {
        if (!searchText) return safeOptions;
        const lowerSearch = searchText.toLowerCase();
        return safeOptions.filter(opt =>
            opt.label && String(opt.label).toLowerCase().includes(lowerSearch)
        );
    }, [safeOptions, searchText]);

    const handleSearchKeyDown = (e) => {
        // Se for uma tecla de navegação, deixa o Select lidar
        // Se for letra/número, impede que o Select tente selecionar uma opção
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') {
            e.stopPropagation();
        }
    };

    return (
        <TextField
            select
            label={label}
            value={value}
            onChange={onChange}
            name={name}
            disabled={disabled}
            required={required}
            fullWidth
            InputLabelProps={InputLabelProps}
            sx={sx}
            SelectProps={{
                MenuProps: {
                    autoFocus: false, // Importante para o foco ficar no input de busca se clicado
                    PaperProps: {
                        sx: { maxHeight: 300 }
                    }
                },
                onClose: () => setSearchText('') // Limpa busca ao fechar
            }}
        >
            {/* CAMPO DE BUSCA */}
            <ListSubheader sx={{ bgcolor: 'background.paper', p: 1 }}>
                <TextField
                    size="small"
                    autoFocus
                    placeholder="Pesquisar..."
                    fullWidth
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    // Impede que o clique no input feche o Select
                    onClick={(e) => e.stopPropagation()}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search size={16} color="#94a3b8" />
                            </InputAdornment>
                        )
                    }}
                />
            </ListSubheader>

            {/* OPÇÕES */}
            {filteredOptions.length > 0 ? (
                filteredOptions.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                    </MenuItem>
                ))
            ) : (
                <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.secondary">
                        Nenhum resultado encontrado.
                    </Typography>
                </Box>
            )}
        </TextField>
    );
};

export default SearchableSelect;