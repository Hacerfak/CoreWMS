import { useState } from 'react';
import { Box, Typography, Tabs, Tab, Paper } from '@mui/material';
import { Warehouse, Grid as GridIcon, MapPin } from 'lucide-react';
import ArmazemList from './ArmazemList';
import AreaList from './AreaList';
import LocalizacaoList from './LocalizacaoList';

const MapeamentoView = () => {
    const [tabIndex, setTabIndex] = useState(0);

    return (
        <Box>
            <Typography variant="h5" fontWeight="bold" mb={3}>Mapeamento Logístico</Typography>

            <Paper sx={{ mb: 3 }}>
                <Tabs value={tabIndex} onChange={(e, v) => setTabIndex(v)} variant="fullWidth">
                    <Tab icon={<Warehouse size={20} />} iconPosition="start" label="1. Armazéns" />
                    <Tab icon={<GridIcon size={20} />} iconPosition="start" label="2. Áreas / Zonas" />
                    <Tab icon={<MapPin size={20} />} iconPosition="start" label="3. Endereços Físicos" />
                </Tabs>
            </Paper>

            <Box>
                {tabIndex === 0 && <ArmazemList />}
                {tabIndex === 1 && <AreaList />}
                {tabIndex === 2 && <LocalizacaoList />}
            </Box>
        </Box>
    );
};

export default MapeamentoView;