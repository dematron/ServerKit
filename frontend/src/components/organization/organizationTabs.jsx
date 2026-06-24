import { FolderKanban, Braces, LayoutGrid } from 'lucide-react';

// Shared sub-nav for the Organization page group (Projects / Shared Variables /
// Workspaces). Rendered in the shared PageTopbar via TabGroupLayout — the
// top-bar layout replaces the old collapsible sidebar sub-menu, matching every
// other group (Servers, Domains, Services, …). See docs/REDESIGN_MAP.md §6
// decision 3. Routes /projects, /shared-variables, /workspaces are unchanged
// and still reachable from these tabs.
export const ORG_TABS = [
    { to: '/projects', label: 'Projects', end: true, icon: <FolderKanban size={15} /> },
    { to: '/shared-variables', label: 'Shared Variables', icon: <Braces size={15} /> },
    { to: '/workspaces', label: 'Workspaces', icon: <LayoutGrid size={15} /> },
];
