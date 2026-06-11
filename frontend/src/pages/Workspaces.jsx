import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import Spinner from '../components/Spinner';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { LayoutGrid, Plus } from 'lucide-react';
import { PageTopbar, Pill, ServiceTile, SegControl } from '@/components/ds';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

// "since Jun 2026" card meta from the workspace's real created_at.
const formatSince = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? null
        : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
};

const Workspaces = () => {
    const toast = useToast();
    const { user } = useAuth();
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showMembersModal, setShowMembersModal] = useState(null);
    const [members, setMembers] = useState([]);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [allUsers, setAllUsers] = useState([]);
    const [showResourcesModal, setShowResourcesModal] = useState(null);
    const [apps, setApps] = useState([]);
    const [servers, setServers] = useState([]);
    const [sharingApp, setSharingApp] = useState(null);
    const [grants, setGrants] = useState([]);
    const [grantRole, setGrantRole] = useState('editor');
    const [form, setForm] = useState({ name: '', description: '', max_servers: 0, max_users: 0, primary_color: '#6d7cff' });

    const loadWorkspaces = useCallback(async () => {
        try {
            const data = await api.getWorkspaces();
            setWorkspaces(data.workspaces || []);
        } catch (err) {
            toast.error('Failed to load workspaces');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

    const handleCreate = async () => {
        try {
            await api.createWorkspace(form);
            toast.success('Workspace created');
            setShowCreateModal(false);
            setForm({ name: '', description: '', max_servers: 0, max_users: 0, primary_color: '#6d7cff' });
            loadWorkspaces();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.deleteWorkspace(id);
            toast.success('Workspace deleted');
            setDeleteConfirm(null);
            loadWorkspaces();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleArchive = async (id) => {
        try {
            await api.archiveWorkspace(id);
            toast.success('Workspace archived');
            loadWorkspaces();
        } catch (err) {
            toast.error(err.message);
        }
    };

    const loadMembers = async (wsId) => {
        try {
            const [mData, uData] = await Promise.all([
                api.getWorkspaceMembers(wsId),
                api.getUsers().catch(() => ({ users: [] }))
            ]);
            setMembers(mData.members || []);
            setAllUsers(uData.users || []);
            setShowMembersModal(wsId);
        } catch (err) {
            toast.error('Failed to load members');
        }
    };

    const handleAddMember = async (wsId, userId) => {
        try {
            await api.addWorkspaceMember(wsId, userId);
            toast.success('Member added');
            loadMembers(wsId);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRemoveMember = async (memberId) => {
        try {
            await api.removeWorkspaceMember(memberId);
            toast.success('Member removed');
            if (showMembersModal) loadMembers(showMembersModal);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const asServerList = (data) => (Array.isArray(data) ? data : (data?.servers || []));

    const loadResources = async (wsId) => {
        try {
            // allWorkspaces so we can see resources in OTHER workspaces to move them in.
            const [appData, srvData] = await Promise.all([
                api.getApps({ allWorkspaces: true }),
                api.getServers({ allWorkspaces: true }).catch(() => []),
            ]);
            setApps(appData.apps || []);
            setServers(asServerList(srvData));
            setShowResourcesModal(wsId);
        } catch (err) {
            toast.error('Failed to load resources');
        }
    };

    const handleMoveApp = async (appId, workspaceId) => {
        try {
            await api.setAppWorkspace(appId, workspaceId);
            toast.success('Application moved');
            const data = await api.getApps({ allWorkspaces: true });
            setApps(data.apps || []);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleMoveServer = async (serverId, workspaceId) => {
        try {
            await api.setServerWorkspace(serverId, workspaceId);
            toast.success('Server moved');
            setServers(asServerList(await api.getServers({ allWorkspaces: true })));
        } catch (err) {
            toast.error(err.message);
        }
    };

    // Per-app sharing (#33 per-site ACL) — inline sub-view of the Resources modal.
    const loadSharing = async (appObj) => {
        try {
            const [gData, uData] = await Promise.all([
                api.getAppGrants(appObj.id),
                api.getUsers().catch(() => ({ users: [] })),
            ]);
            setGrants(gData.grants || []);
            setAllUsers(uData.users || []);
            setSharingApp(appObj);
        } catch (err) {
            toast.error('Failed to load sharing');
        }
    };

    const refreshGrants = async (appId) => {
        const gData = await api.getAppGrants(appId);
        setGrants(gData.grants || []);
    };

    const handleGrant = async (userId) => {
        try {
            await api.grantAppAccess(sharingApp.id, userId, grantRole);
            toast.success('Access granted');
            await refreshGrants(sharingApp.id);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const handleRevoke = async (grantId) => {
        try {
            await api.revokeAppAccess(sharingApp.id, grantId);
            toast.success('Access revoked');
            await refreshGrants(sharingApp.id);
        } catch (err) {
            toast.error(err.message);
        }
    };

    const closeResources = () => {
        setShowResourcesModal(null);
        setSharingApp(null);
    };

    if (loading) return <Spinner />;

    return (
        <div className="page-container workspaces-page">
            <PageTopbar
                icon={<LayoutGrid size={18} />}
                title="Workspaces"
                meta={`${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}`}
                actions={(
                    <Button size="sm" onClick={() => setShowCreateModal(true)}>
                        <Plus size={16} />
                        New Workspace
                    </Button>
                )}
            />

            {workspaces.length === 0 ? (
                <EmptyState
                    icon={LayoutGrid}
                    title="No workspaces yet"
                    description="Create one to isolate servers by team or project."
                />
            ) : (
                <>
                    <div className="ws-listhead">
                        <h2>Your Workspaces</h2>
                        <span className="ws-listhead__hint">isolate servers &amp; apps by team or project</span>
                    </div>
                    <div className="ws-grid">
                        {workspaces.map(ws => {
                            const since = formatSince(ws.created_at);
                            return (
                                <div key={ws.id} className="ws-card">
                                    <div className="ws-card__top">
                                        <ServiceTile name={ws.name} size={38} gradient={ws.primary_color || undefined} />
                                        <Pill kind={ws.status === 'active' ? 'green' : 'amber'}>{ws.status}</Pill>
                                    </div>
                                    <div className="ws-card__name">{ws.name}</div>
                                    <div className="ws-card__meta">/{ws.slug}{since ? ` · since ${since}` : ''}</div>
                                    {ws.description && <p className="ws-card__desc">{ws.description}</p>}
                                    <div className="ws-card__stats">
                                        <div>
                                            <div className="v">{ws.member_count}</div>
                                            <div className="l">Member{ws.member_count !== 1 ? 's' : ''}</div>
                                        </div>
                                        {ws.max_servers > 0 && (
                                            <div>
                                                <div className="v">{ws.max_servers}</div>
                                                <div className="l">Max Servers</div>
                                            </div>
                                        )}
                                        {ws.max_users > 0 && (
                                            <div>
                                                <div className="v">{ws.max_users}</div>
                                                <div className="l">Max Users</div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="ws-card__actions">
                                        <Button size="sm" variant="outline" onClick={() => loadMembers(ws.id)}>Members</Button>
                                        <Button size="sm" variant="outline" onClick={() => loadResources(ws.id)}>Resources</Button>
                                        {ws.status === 'active' && (
                                            <Button size="sm" variant="secondary" onClick={() => handleArchive(ws.id)}>Archive</Button>
                                        )}
                                        {user?.is_admin && (
                                            <Button size="sm" variant="destructive" onClick={() => setDeleteConfirm(ws)}>Delete</Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {showCreateModal && (
                <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Create Workspace</h2>
                            <button className="modal-close" onClick={() => setShowCreateModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>Name</label>
                                <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="My Team" />
                            </div>
                            <div className="form-group">
                                <label>Description</label>
                                <Textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={2} />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Max Servers (0 = unlimited)</label>
                                    <Input type="number" value={form.max_servers} onChange={e => setForm({...form, max_servers: parseInt(e.target.value) || 0})} />
                                </div>
                                <div className="form-group">
                                    <label>Max Users (0 = unlimited)</label>
                                    <Input type="number" value={form.max_users} onChange={e => setForm({...form, max_users: parseInt(e.target.value) || 0})} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Brand Color</label>
                                <input
                                    type="color"
                                    className="workspace-color-input"
                                    value={form.primary_color}
                                    onChange={e => setForm({...form, primary_color: e.target.value})}
                                    aria-label="Workspace brand color"
                                />
                                <span className="form-hint">Recolors the panel for anyone viewing this workspace. Leave the default for no custom branding.</span>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Cancel</Button>
                            <Button onClick={handleCreate} disabled={!form.name}>Create</Button>
                        </div>
                    </div>
                </div>
            )}

            {showMembersModal && (
                <div className="modal-overlay" onClick={() => setShowMembersModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Workspace Members</h2>
                            <button className="modal-close" onClick={() => setShowMembersModal(null)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            <div className="ws-rows">
                                {members.map(m => (
                                    <div key={m.id} className="ws-row">
                                        <ServiceTile name={m.username || m.email || '?'} size={28} className="ws-row__av" />
                                        <div className="ws-row__id">
                                            <strong>{m.username || m.email}</strong>
                                            {m.username && m.email && <div className="ws-row__sub">{m.email}</div>}
                                        </div>
                                        {m.role === 'owner'
                                            ? <Pill kind="green">{m.role}</Pill>
                                            : <span className="sk-tag">{m.role}</span>}
                                        {m.role !== 'owner' && (
                                            <Button size="sm" variant="destructive" onClick={() => handleRemoveMember(m.id)}>Remove</Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <hr />
                            <h4>Add Member</h4>
                            <div className="ws-pick">
                                {allUsers.filter(u => !members.find(m => m.user_id === u.id)).map(u => (
                                    <div key={u.id} className="ws-pick__item" onClick={() => handleAddMember(showMembersModal, u.id)}>
                                        <ServiceTile name={u.username || u.email || '?'} size={24} className="ws-row__av" />
                                        <span className="ws-pick__name">{u.username || u.email}</span>
                                        <Plus size={14} className="ws-pick__plus" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showResourcesModal && (() => {
                const appsIn = apps.filter(a => a.workspace_id === showResourcesModal);
                const appsOut = apps.filter(a => a.workspace_id !== showResourcesModal);
                const srvIn = servers.filter(s => s.workspace_id === showResourcesModal);
                const srvOut = servers.filter(s => s.workspace_id !== showResourcesModal);
                return (
                    <div className="modal-overlay" onClick={closeResources}>
                        <div className="modal" onClick={e => e.stopPropagation()}>
                            {sharingApp ? (
                                <>
                                    <div className="modal-header">
                                        <h2>Sharing: {sharingApp.name}</h2>
                                        <button className="modal-close" onClick={closeResources}>&times;</button>
                                    </div>
                                    <div className="modal-body">
                                        <Button size="sm" variant="outline" onClick={() => setSharingApp(null)}>&larr; Back</Button>
                                        <p className="form-hint">Grant a user access to this application (and its WordPress site, databases, and domains) without transferring ownership.</p>
                                        <div className="ws-rows">
                                            {grants.length === 0 && <p className="form-hint">Not shared with anyone yet.</p>}
                                            {grants.map(g => (
                                                <div key={g.id} className="ws-row">
                                                    <ServiceTile name={g.username || g.email || '?'} size={28} className="ws-row__av" />
                                                    <div className="ws-row__id">
                                                        <strong>{g.username || g.email}</strong>
                                                        <span className="sk-tag">{g.role}</span>
                                                    </div>
                                                    <Button size="sm" variant="destructive" onClick={() => handleRevoke(g.id)}>Revoke</Button>
                                                </div>
                                            ))}
                                        </div>
                                        <hr />
                                        <h4>Grant Access</h4>
                                        <div className="form-group">
                                            <label>Role for new grants</label>
                                            <SegControl
                                                value={grantRole}
                                                onChange={setGrantRole}
                                                options={[
                                                    { value: 'editor', label: 'Editor · view + operate' },
                                                    { value: 'viewer', label: 'Viewer · read-only' },
                                                ]}
                                            />
                                        </div>
                                        <div className="ws-pick">
                                            {allUsers.filter(u => u.id !== sharingApp.user_id && !grants.find(g => g.user_id === u.id)).map(u => (
                                                <div key={u.id} className="ws-pick__item" onClick={() => handleGrant(u.id)}>
                                                    <ServiceTile name={u.username || u.email || '?'} size={24} className="ws-row__av" />
                                                    <span className="ws-pick__name">{u.username || u.email}</span>
                                                    <Plus size={14} className="ws-pick__plus" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="modal-header">
                                        <h2>Workspace Resources</h2>
                                        <button className="modal-close" onClick={closeResources}>&times;</button>
                                    </div>
                                    <div className="modal-body">
                                        <h4>Applications</h4>
                                        <div className="ws-rows">
                                            {appsIn.length === 0 && <p className="form-hint">No applications in this workspace yet.</p>}
                                            {appsIn.map(a => (
                                                <div key={a.id} className="ws-row">
                                                    <ServiceTile name={a.name} size={28} />
                                                    <div className="ws-row__id">
                                                        <strong>{a.name}</strong>
                                                        <span className="sk-tag">{a.app_type}</span>
                                                    </div>
                                                    <div className="workspace-row-actions">
                                                        <Button size="sm" variant="outline" onClick={() => loadSharing(a)}>Share</Button>
                                                        <Button size="sm" variant="destructive" onClick={() => handleMoveApp(a.id, null)}>Remove</Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        {appsOut.length > 0 && (
                                            <>
                                                <div className="ws-pick-label">Move an application into this workspace</div>
                                                <div className="ws-pick">
                                                    {appsOut.map(a => (
                                                        <div key={a.id} className="ws-pick__item" onClick={() => handleMoveApp(a.id, showResourcesModal)}>
                                                            <span className="ws-pick__name">{a.name}</span>
                                                            <span className="sk-tag">{a.app_type}</span>
                                                            <Plus size={14} className="ws-pick__plus" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                        <hr />
                                        <h4>Servers</h4>
                                        <div className="ws-rows">
                                            {srvIn.length === 0 && <p className="form-hint">No servers in this workspace yet.</p>}
                                            {srvIn.map(s => (
                                                <div key={s.id} className="ws-row">
                                                    <ServiceTile name={s.name} size={28} />
                                                    <div className="ws-row__id">
                                                        <strong>{s.name}</strong>
                                                    </div>
                                                    <Button size="sm" variant="destructive" onClick={() => handleMoveServer(s.id, null)}>Remove</Button>
                                                </div>
                                            ))}
                                        </div>
                                        {srvOut.length > 0 && (
                                            <>
                                                <div className="ws-pick-label">Move a server into this workspace</div>
                                                <div className="ws-pick">
                                                    {srvOut.map(s => (
                                                        <div key={s.id} className="ws-pick__item" onClick={() => handleMoveServer(s.id, showResourcesModal)}>
                                                            <span className="ws-pick__name">{s.name}</span>
                                                            <Plus size={14} className="ws-pick__plus" />
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            {deleteConfirm && (
                <ConfirmDialog
                    title="Delete Workspace"
                    message={`Delete "${deleteConfirm.name}"? All data will be lost.`}
                    onConfirm={() => handleDelete(deleteConfirm.id)}
                    onCancel={() => setDeleteConfirm(null)}
                    variant="danger"
                />
            )}
        </div>
    );
};

export default Workspaces;
