import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { GitBranch, Boxes } from 'lucide-react';
import api from '../services/api';
import EmptyState from '../components/EmptyState';
import useTabParam from '../hooks/useTabParam';
import EnvironmentVariables from '../components/EnvironmentVariables';
import ContainerOpsPanel from '../components/apps/ContainerOpsPanel';
import AppWafPanel from '../components/apps/AppWafPanel';
import PreviewList from '../components/previews/PreviewList';
import { getServiceType, getStatusConfig } from '../utils/serviceTypes';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Pill, EnvTag } from '@/components/ds';
import { STATUS_PILL, INGRESS_META } from '../components/appdetail/appDetailShared';
import OverviewTab from '../components/appdetail/OverviewTab';
import PackagesTab from '../components/appdetail/PackagesTab';
import GunicornTab from '../components/appdetail/GunicornTab';
import CommandsTab from '../components/appdetail/CommandsTab';
import BuildTab from '../components/appdetail/BuildTab';
import LogsTab from '../components/appdetail/LogsTab';
import SettingsTab from '../components/appdetail/SettingsTab';
import DeployTab from '../components/appdetail/DeployTab';

const VALID_TABS = ['overview', 'environment', 'packages', 'gunicorn', 'commands', 'ops', 'waf', 'build', 'deploy', 'previews', 'logs', 'settings'];

const ApplicationDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [app, setApp] = useState(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useTabParam(`/apps/${id}`, VALID_TABS);

    useEffect(() => {
        loadApp();
    }, [id]);

    // Redirect WordPress apps to the dedicated WordPress detail page
    useEffect(() => {
        if (app && app.app_type === 'wordpress') {
            navigate(`/wordpress/${id}`, { replace: true });
        }
    }, [app, id, navigate]);

    async function loadApp() {
        try {
            const data = await api.getApp(id);
            setApp(data.app);
        } catch (err) {
            console.error('Failed to load app:', err);
        } finally {
            setLoading(false);
        }
    }

    async function handleAction(action) {
        try {
            if (action === 'start') {
                await api.startApp(id);
            } else if (action === 'stop') {
                await api.stopApp(id);
            } else if (action === 'restart') {
                await api.restartApp(id);
            }
            loadApp();
        } catch (err) {
            console.error(`Failed to ${action} app:`, err);
        }
    }

    function getAppIcon(type) {
        switch (type) {
            case 'wordpress':
                return (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 19.542c-5.261 0-9.542-4.281-9.542-9.542S6.739 2.458 12 2.458 21.542 6.739 21.542 12 17.261 21.542 12 21.542z"/>
                        <path d="M3.019 12c0 3.403 1.977 6.347 4.844 7.746l-4.1-11.237C3.284 9.593 3.019 10.764 3.019 12zm15.109-.274c0-1.063-.382-1.799-.709-2.372-.436-.709-.845-1.309-.845-2.018 0-.791.6-1.527 1.446-1.527.038 0 .074.005.111.007A8.954 8.954 0 0012 3.019c-3.218 0-6.049 1.65-7.699 4.149.216.007.42.011.594.011.964 0 2.458-.117 2.458-.117.497-.029.555.701.059.76 0 0-.499.059-1.055.088l3.356 9.979 2.017-6.042-1.436-3.937c-.497-.029-.968-.088-.968-.088-.497-.029-.439-.789.058-.76 0 0 1.523.117 2.429.117.964 0 2.458-.117 2.458-.117.497-.029.556.701.059.76 0 0-.5.059-1.055.088l3.331 9.905.92-3.072c.398-1.275.702-2.19.702-2.978z"/>
                    </svg>
                );
            case 'docker':
                return (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.185.185 0 00-.185.185v1.888c0 .102.083.185.185.185m-2.954-5.43h2.118a.186.186 0 00.186-.186V3.574a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.186m0 2.716h2.118a.187.187 0 00.186-.186V6.29a.186.186 0 00-.186-.185h-2.118a.185.185 0 00-.185.185v1.887c0 .102.082.185.185.186m-2.93 0h2.12a.186.186 0 00.184-.186V6.29a.185.185 0 00-.185-.185H8.1a.185.185 0 00-.185.185v1.887c0 .102.083.185.185.186m-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.185.185 0 00-.185-.185H5.136a.186.186 0 00-.186.185v1.887c0 .102.084.185.186.186m5.893 2.715h2.118a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.118a.185.185 0 00-.185.185v1.888c0 .102.082.185.185.185m-2.93 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.083.185.185.185m-2.964 0h2.119a.185.185 0 00.185-.185V9.006a.185.185 0 00-.184-.186h-2.12a.186.186 0 00-.186.186v1.887c0 .102.084.185.186.185m-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.185v1.888c0 .102.082.185.185.185M23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.376 11.376 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288z"/>
                    </svg>
                );
            default:
                return <span>{type.charAt(0).toUpperCase()}</span>;
        }
    }

    if (loading) {
        return <EmptyState loading size="lg" title="Loading application..." />;
    }

    if (!app) {
        return (
            <EmptyState
                size="lg"
                icon={Boxes}
                title="Application not found"
                action={<Button onClick={() => navigate('/apps')}>Back to Applications</Button>}
            />
        );
    }

    const isPythonApp = ['flask', 'django'].includes(app.app_type);
    const isDockerApp = app.app_type === 'docker';
    // WAF protects the nginx vhost in front of an app, so it applies to any
    // nginx-served app type (Docker or Python) — broader than Container Ops.
    const isNginxServedApp = isDockerApp || isPythonApp;
    const isRunning = app.status === 'running';
    const typeInfo = getServiceType(app.app_type);
    const statusInfo = getStatusConfig(app.status);
    const ingressMeta = INGRESS_META[app.ingress_plane] || INGRESS_META.nginx;

    return (
        <div className="page-container app-detail-page">
            {/* Top Bar with Breadcrumbs and Actions */}
            <div className="app-detail-topbar">
                <div className="app-detail-breadcrumbs">
                    <Link to="/apps">Applications</Link>
                    <span>/</span>
                    <span className="current">{app.name}</span>
                </div>
                <div className="app-detail-actions">
                    {app.port && (
                        <Button variant="ghost" asChild>
                            <a
                                href={`http://localhost:${app.port}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                    <polyline points="15 3 21 3 21 9"/>
                                    <line x1="10" y1="14" x2="21" y2="3"/>
                                </svg>
                                Open App
                            </a>
                        </Button>
                    )}
                    {isRunning && (
                        <>
                            <Button variant="ghost" onClick={() => handleAction('restart')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <polyline points="1 20 1 14 7 14"/>
                                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                                </svg>
                                Restart
                            </Button>
                            <Button variant="outline" onClick={() => handleAction('stop')}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="6" y="6" width="12" height="12"/>
                                </svg>
                                Stop
                            </Button>
                        </>
                    )}
                    {!isRunning && (
                        <Button onClick={() => handleAction('start')}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                            Start
                        </Button>
                    )}
                </div>
            </div>

            {/* App Header */}
            <div className="app-detail-header">
                <div className="app-detail-icon" style={{ background: typeInfo.bgColor, color: typeInfo.color }}>
                    {getAppIcon(app.app_type)}
                </div>
                <div className="app-detail-title-block">
                    <h1>
                        {app.name}
                        <Pill kind={STATUS_PILL[statusInfo.dotClass] || 'gray'}>{statusInfo.label}</Pill>
                        <Pill kind={ingressMeta.kind} dot={false}>{ingressMeta.label}</Pill>
                        {app.environment_type && app.environment_type !== 'standalone' && (
                            <EnvTag env={app.environment_type}>
                                {app.environment_type === 'production' ? 'PROD' :
                                 app.environment_type === 'development' ? 'DEV' : 'STAGING'}
                                {app.has_linked_app && <GitBranch size={10} />}
                            </EnvTag>
                        )}
                    </h1>
                    <div className="app-detail-subtitle">
                        <span>{app.app_type.toUpperCase()}</span>
                        <span className="separator">&middot;</span>
                        {app.port && <><span className="mono">Port {app.port}</span><span className="separator">&middot;</span></>}
                        <span>Created {new Date(app.created_at).toLocaleDateString()}</span>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="environment">Environment</TabsTrigger>
                    {isPythonApp && (
                        <>
                            <TabsTrigger value="packages">Packages</TabsTrigger>
                            <TabsTrigger value="gunicorn">Gunicorn</TabsTrigger>
                            <TabsTrigger value="commands">Commands</TabsTrigger>
                        </>
                    )}
                    {isDockerApp && (
                        <TabsTrigger value="ops">Container Ops</TabsTrigger>
                    )}
                    {isNginxServedApp && (
                        <TabsTrigger value="waf">WAF</TabsTrigger>
                    )}
                    <TabsTrigger value="build">Build</TabsTrigger>
                    <TabsTrigger value="deploy">Deploy</TabsTrigger>
                    <TabsTrigger value="previews">Previews</TabsTrigger>
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                {/* Tab Content */}
                <div className="app-detail-content">
                    <TabsContent value="overview">
                        <OverviewTab app={app} onUpdate={loadApp} />
                    </TabsContent>
                    <TabsContent value="environment">
                        <EnvironmentVariables appId={app.id} />
                    </TabsContent>
                    {isPythonApp && (
                        <>
                            <TabsContent value="packages">
                                <PackagesTab appId={app.id} />
                            </TabsContent>
                            <TabsContent value="gunicorn">
                                <GunicornTab appId={app.id} />
                            </TabsContent>
                            <TabsContent value="commands">
                                <CommandsTab appId={app.id} appType={app.app_type} />
                            </TabsContent>
                        </>
                    )}
                    {isDockerApp && (
                        <TabsContent value="ops">
                            <ContainerOpsPanel app={app} onChanged={loadApp} />
                        </TabsContent>
                    )}
                    {isNginxServedApp && (
                        <TabsContent value="waf">
                            <AppWafPanel app={app} onChanged={loadApp} />
                        </TabsContent>
                    )}
                    <TabsContent value="build">
                        <BuildTab appId={app.id} appPath={app.path} app={app} />
                    </TabsContent>
                    <TabsContent value="deploy">
                        <DeployTab appId={app.id} appPath={app.path} />
                    </TabsContent>
                    <TabsContent value="previews">
                        <PreviewList appId={app.id} />
                    </TabsContent>
                    <TabsContent value="logs">
                        <LogsTab app={app} />
                    </TabsContent>
                    <TabsContent value="settings">
                        <SettingsTab app={app} onUpdate={loadApp} />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
};

export default ApplicationDetail;
