import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Owner } from './Owner';
import { OwnerPreview } from './OwnerPreview';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname === '/owner' ? <Owner /> : location.pathname === '/owner-preview' ? <OwnerPreview /> : <App />}</React.StrictMode>);
