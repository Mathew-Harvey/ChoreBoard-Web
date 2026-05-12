import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ToastViewport } from './ui/Toast';
import { loadStoredToken } from './lib/sessionToken';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        if (error?.status === 401 || error?.status === 403) return false;
        return failureCount < 2;
      },
    },
  },
});

// On native, the bearer token lives in Capacitor.Preferences. We hydrate it
// into the in-memory cache before mounting React so the very first call to
// /api/auth/me already carries the right Authorization header. On web this
// resolves immediately to a no-op.
loadStoredToken().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <ToastViewport />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
