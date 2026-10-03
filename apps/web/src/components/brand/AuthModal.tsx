import React, { useState } from 'react';
import { VoltMeshLogo } from './VoltMeshLogo';
import { Shield, Key, Lock, X, CheckCircle2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated?: (account: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthenticated,
}) => {
  const [selectedRole, setSelectedRole] = useState<'prosumer' | 'discom' | 'auditor'>('prosumer');
  const [simulatedAddress, setSimulatedAddress] = useState('0x1111111111111111111111111111111111111111');

  if (!isOpen) return null;

  const handleConnect = () => {
    if (onAuthenticated) {
      onAuthenticated(simulatedAddress);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm font-mono text-xs select-none">
      <div className="max-w-md w-full bg-[#121215] border border-zinc-800 rounded-sm shadow-2xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4 mb-6">
          <VoltMeshLogo size="md" withGlow />

          <div>
            <h2 className="text-base font-bold text-white tracking-tight uppercase font-sans">
              VoltMesh
            </h2>
            <div className="text-[10px] text-cyan-400 font-semibold tracking-wider uppercase mt-0.5">
              DECENTRALIZED ENERGY EXCHANGE
            </div>
            <p className="text-zinc-400 text-[11px] font-sans mt-2">
              Cryptographic participant authentication and hardware enclave keystore authorization.
            </p>
          </div>
        </div>

        {/* Role Selector */}
        <div className="space-y-2 mb-4">
          <label className="text-[10px] text-zinc-400 font-semibold uppercase">
            SELECT INSTITUTIONAL IDENTITY
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'prosumer', label: 'PROSUMER', sub: 'Zone 1 DER' },
              { id: 'discom', label: 'DISCOM', sub: 'Grid Operator' },
              { id: 'auditor', label: 'REGULATOR', sub: 'DERC / CERC' },
            ].map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => {
                  setSelectedRole(role.id as any);
                  if (role.id === 'prosumer') setSimulatedAddress('0x1111111111111111111111111111111111111111');
                  if (role.id === 'discom') setSimulatedAddress('0x3333333333333333333333333333333333333333');
                  if (role.id === 'auditor') setSimulatedAddress('0x7777777777777777777777777777777777777777');
                }}
                className={`p-2.5 rounded border text-left transition-all ${
                  selectedRole === role.id
                    ? 'border-cyan-500 bg-cyan-950/30 text-white'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="font-bold text-xs">{role.label}</div>
                <div className="text-[9px] text-zinc-500">{role.sub}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Address preview */}
        <div className="p-3 bg-zinc-950 border border-zinc-800 rounded mb-5">
          <div className="text-[10px] text-zinc-500 mb-1 flex items-center justify-between">
            <span>PUBLIC ADDRESS / HARDWARE ROT</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> VERIFIED
            </span>
          </div>
          <div className="font-mono text-[11px] text-zinc-300 break-all">
            {simulatedAddress}
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleConnect}
          className="w-full bg-cyan-600 hover:bg-cyan-500 text-zinc-950 font-bold py-2.5 px-4 rounded text-xs transition-colors flex items-center justify-center space-x-2"
        >
          <Key className="w-3.5 h-3.5" />
          <span>CONNECT HARDWARE ENCLAVE</span>
        </button>

        <div className="text-center mt-3 text-[10px] text-zinc-600">
          SECURED VIA ED25519 & SECP256K1 ON TESTNET 31337
        </div>
      </div>
    </div>
  );
};

export default AuthModal;
