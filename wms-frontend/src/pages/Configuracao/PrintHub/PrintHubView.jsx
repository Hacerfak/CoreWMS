import { useState } from 'react';
import { Box, Typography, Paper, Tabs, Tab } from '@mui/material';
import { Printer, Server, FileCode, ListVideo } from 'lucide-react';
import AgentesTab from './Components/AgentesTab';
import ImpressorasTab from './Components/ImpressorasTab';
import TemplatesTab from './Components/TemplatesTab';
import FilaTab from './Components/FilaTab';

const PrintHubView = () => {
    const [tabIndex, setTabIndex] = useState(0);

    return (
        <Box>
            <Box mb={3}>
                <Typography variant="h5" fontWeight="bold" color="text.primary">
                    Central de Impressão
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Gerencie Hubs, Impressoras e Templates ZPL.
                </Typography>
            </Box>

            <Paper sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
                <Tabs
                    value={tabIndex}
                    onChange={(e, v) => setTabIndex(v)}
                    variant="fullWidth"
                    sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}
                >
                    <Tab icon={<Server size={20} />} iconPosition="start" label="Agentes (Hubs)" />
                    <Tab icon={<Printer size={20} />} iconPosition="start" label="Impressoras" />
                    <Tab icon={<FileCode size={20} />} iconPosition="start" label="Templates ZPL" />
                    <Tab icon={<ListVideo size={20} />} iconPosition="start" label="Fila de Impressão" />
                </Tabs>
            </Paper>

            <Box>
                {tabIndex === 0 && <AgentesTab />}
                {tabIndex === 1 && <ImpressorasTab />}
                {tabIndex === 2 && <TemplatesTab />}
                {tabIndex === 3 && <FilaTab />}
            </Box>
        </Box>
    );
};

export default PrintHubView;