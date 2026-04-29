import { Routes, Route, Navigate } from 'react-router-dom';
import ConsolePage from './pages/ConsolePage.jsx';

export default function App() {
    return (
        <Routes>
            <Route path="/console" element={<ConsolePage />} />
            <Route path="*" element={<Navigate to="/console" replace />} />
        </Routes>
    );
}
