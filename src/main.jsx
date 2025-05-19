import React from 'react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import 'bootstrap/dist/js/bootstrap.bundle.min.js';
import { BrowserRouter } from 'react-router-dom';


const root = createRoot(document.getElementById('root'))
root.render(
    <StrictMode>
        <App />
    </StrictMode>,
)
