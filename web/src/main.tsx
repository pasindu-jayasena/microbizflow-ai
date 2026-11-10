import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Owner } from './Owner';
import './style.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode>{location.pathname === '/owner' ? <Owner /> : <App />}</React.StrictMode>);
