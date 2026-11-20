import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Provider, folder } from './loan-preview-context';
import { LoanFolderView } from '../src/components/loan/LoanFolderView';
import '../src/globals.css';
createRoot(document.getElementById('root')!).render(<MemoryRouter><Provider><main className="mx-auto max-w-6xl p-4"><LoanFolderView folder={folder as any}/></main><Toaster/></Provider></MemoryRouter>);
