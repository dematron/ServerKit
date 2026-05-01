import {
    Folder, Eye, Download, Edit3, Lock, Copy, Star, StarOff, Trash2,
} from 'lucide-react';

export default function ContextMenu({
    menu,                  // { x, y, entry }
    selectionCount,        // total items selected
    isPinned,
    onClose,
    onOpen,
    onDownload,
    onRename,
    onPermissions,
    onCopyPath,
    onTogglePin,
    onDelete,
}) {
    if (!menu) return null;
    const { x, y, entry } = menu;
    const multi = selectionCount > 1;

    return (
        <div
            className="context-menu"
            style={{ top: y, left: x }}
            onClick={(e) => e.stopPropagation()}
        >
            <button onClick={() => { onOpen(entry); onClose(); }}>
                {entry.is_dir ? <Folder size={14} /> : <Eye size={14} />}
                {entry.is_dir ? 'Open' : 'Preview'}
            </button>
            {!entry.is_dir && (
                <button onClick={() => { onDownload(entry); onClose(); }}>
                    <Download size={14} /> Download
                </button>
            )}
            <button onClick={() => { onRename(entry); onClose(); }}>
                <Edit3 size={14} /> Rename
            </button>
            <button onClick={() => { onPermissions(entry); onClose(); }}>
                <Lock size={14} /> Permissions
            </button>
            <button onClick={() => { onCopyPath(entry.path); onClose(); }}>
                <Copy size={14} /> Copy path
            </button>
            {entry.is_dir && (
                <button onClick={() => { onTogglePin(entry); onClose(); }}>
                    {isPinned(entry.path)
                        ? <><StarOff size={14} /> Unpin</>
                        : <><Star size={14} /> Pin to Quick Access</>}
                </button>
            )}
            <div className="context-menu-divider" />
            <button className="danger" onClick={() => { onDelete(entry); onClose(); }}>
                <Trash2 size={14} /> Delete{multi ? ` ${selectionCount} items` : ''}
            </button>
        </div>
    );
}
