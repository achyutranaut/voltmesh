import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SessionProvider } from './auth/SessionContext';
import { WalletProvider } from './context/WalletContext';
import { PipelineProvider } from './context/PipelineContext';
import { TransactionModal } from './components/common/TransactionModal';
import { ErrorBoundary } from './components/brand/ErrorBoundary';
import './index.css';

// Polyfill BigInt.prototype.toJSON to prevent "TypeError: Do not know how to serialize a BigInt"
// globally across all JSON.stringify operations (Viem uint256 values, logs, and state serialization)
if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return this.toString();
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SessionProvider>
        <WalletProvider>
          <PipelineProvider>
            <TransactionModal />
            <App />
          </PipelineProvider>
        </WalletProvider>
      </SessionProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
