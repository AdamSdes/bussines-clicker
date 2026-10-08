import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { useGame } from './store/game';
import { useUi } from './store/ui';

// Доступ к состоянию из консоли в режиме разработки (для отладки и автотестов)
if (import.meta.env.DEV) Object.assign(window, { __game: useGame, __ui: useUi });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
