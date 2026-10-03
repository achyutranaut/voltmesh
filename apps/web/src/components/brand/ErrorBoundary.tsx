import React, { Component, ErrorInfo, ReactNode } from 'react';
import { VoltMeshLogo } from './VoltMeshLogo';
import { RefreshCw, AlertTriangle, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('VoltMesh Runtime Error Boundary Caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#09090b] text-zinc-200 flex flex-col items-center justify-center p-6 font-mono select-none">
          <div className="max-w-md w-full bg-[#121215] border border-zinc-800 p-8 rounded-sm shadow-2xl flex flex-col items-center text-center space-y-6">
            <VoltMeshLogo size="lg" withGlow />

            <div className="space-y-1">
              <div className="text-xs text-cyan-400 font-semibold tracking-wider uppercase">
                DECENTRALIZED ENERGY EXCHANGE
              </div>
              <h1 className="text-xl font-bold text-white uppercase tracking-tight font-sans">
                Something went wrong.
              </h1>
              <p className="text-xs text-zinc-400 font-sans leading-relaxed mt-2">
                An unexpected execution anomaly was encountered by the local terminal interface. System state has been safely contained.
              </p>
            </div>

            {this.state.error && (
              <div className="w-full bg-zinc-950/80 border border-red-900/40 p-3 rounded text-[11px] text-red-400 text-left font-mono break-all max-h-32 overflow-y-auto">
                <div className="text-zinc-500 font-semibold mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  EXCEPTION TRACE
                </div>
                {this.state.error.message}
              </div>
            )}

            <button
              onClick={this.handleReset}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold py-2.5 px-4 rounded text-xs transition-colors flex items-center justify-center space-x-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>RETURN TO EXCHANGE</span>
            </button>
          </div>

          <div className="mt-8 text-[11px] text-zinc-600">
            VOLTMESH ENERGY INFRASTRUCTURE · RECOVERY PROTOCOL V1.1
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
