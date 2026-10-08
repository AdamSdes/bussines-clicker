import React from 'react';
import ReactDOM from 'react-dom/client';
import '../design/fonts';
import '../design/newsprint.css';
import './styleguide.css';
import { Styleguide } from './Styleguide';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Styleguide />
  </React.StrictMode>,
);
