import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import CommandPalette from '../components/CommandPalette';
import LogsDrawer from '../components/LogsDrawer';
import { LogsDrawerProvider } from '../contexts/LogsDrawerContext';
import PluginLoader from '../plugins/PluginLoader';
import api from '../services/api';

const FULL_PAGE_ROUTES = ['/workflow', '/files', '/docker'];

const DashboardLayout = () => {
    const location = useLocation();
    const [paletteOpen, setPaletteOpen] = useState(false);
    const isFullPageRoute = FULL_PAGE_ROUTES.some((route) => (
        location.pathname === route || location.pathname.startsWith(`${route}/`)
    ));

    const handleKeyDown = useCallback((e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            setPaletteOpen(prev => !prev);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <LogsDrawerProvider>
            <div className="dashboard-layout">
                <Sidebar />
                <main className={`main-content${isFullPageRoute ? ' main-content--full-page' : ''}`}>
                    <Outlet />
                </main>
                <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
                <LogsDrawer />
                <PluginLoader api={api} />
            </div>
        </LogsDrawerProvider>
    );
};

export default DashboardLayout;
