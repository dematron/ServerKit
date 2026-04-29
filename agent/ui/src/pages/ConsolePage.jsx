import { Activity } from 'lucide-react';

// Hello-world placeholder. The real Overview/Activity/Logs/Actions tabs land
// in the next milestone — this exists so the webview pipeline can be smoke
// tested end-to-end (Vite build → embed.FS → localhost server → WebView2).
export default function ConsolePage() {
    return (
        <div className="console">
            <header className="console__header">
                <div className="console__brand">
                    <Activity size={20} />
                    <span>ServerKit Agent</span>
                </div>
                <span className="console__version">console preview</span>
            </header>
            <main className="console__body">
                <h1>Console is alive</h1>
                <p className="console__lead">
                    The webview host loaded the embedded React app over the
                    localhost asset server. From here we'll layer on the
                    Overview, Activity, Logs, and Actions tabs.
                </p>
            </main>
        </div>
    );
}
