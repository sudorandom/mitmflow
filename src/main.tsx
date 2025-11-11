import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { ModuleRegistry } from 'ag-grid-community';
import { AllCommunityModules } from 'ag-grid-community/all-modules';

ModuleRegistry.registerModules(AllCommunityModules);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
