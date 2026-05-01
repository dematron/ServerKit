import { useEffect, useState } from 'react';
import { api } from '../../services/api';

// Auth-fetches a file via the download endpoint, converts to a blob URL, and
// renders it as an <img>. Falls back to whatever JSX is passed in `fallback`.
export default function ImageThumb({ path, fallback, className = 'thumb-image', alt = '' }) {
    const [src, setSrc] = useState(null);
    const [errored, setErrored] = useState(false);

    useEffect(() => {
        let blobUrl = null;
        let cancelled = false;
        (async () => {
            try {
                const token = api.getToken();
                const url = `${api.baseUrl}/files/download?path=${encodeURIComponent(path)}`;
                const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!res.ok) throw new Error('thumb fetch failed');
                const blob = await res.blob();
                blobUrl = URL.createObjectURL(blob);
                if (!cancelled) setSrc(blobUrl);
            } catch {
                if (!cancelled) setErrored(true);
            }
        })();
        return () => {
            cancelled = true;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
        };
    }, [path]);

    if (errored || !src) return fallback;
    return <img src={src} alt={alt} className={className} loading="lazy" />;
}
