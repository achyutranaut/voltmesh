import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { WalletProvider } from './context/WalletContext';
import { PipelineProvider } from './context/PipelineContext';
import { TransactionModal } from './components/common/TransactionModal';
import { ErrorBoundary } from './components/brand/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WalletProvider>
        <PipelineProvider>
          <TransactionModal />
          <App />
        </PipelineProvider>
      </WalletProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
