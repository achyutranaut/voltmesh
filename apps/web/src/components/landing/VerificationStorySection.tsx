import React, { useState } from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, Binary, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { MeterSimulator, SimulatedFault } from '@energy-dex/meter-sim';
import { SourceType } from '@energy-dex/types';
import { verifyEd25519 } from '@energy-dex/attestation';

export const VerificationStorySection: React.FC = () => {
  const [activeFault, setActiveFault] = useState<SimulatedFault>(SimulatedFault.NONE);
  const [statusMessage, setStatusMessage] = useState<string>('All incoming telemetry nominal. Ed25519 signatures verified.');
  const [isValid, setIsValid] = useState<boolean>(true);
  const [hashOutput, setHashOutput] = useState<string>('0x7f4a...89c1');

  const handleTestFault = (fault: SimulatedFault) => {
    setActiveFault(fault);
    const sim = new MeterSimulator({
      deviceId: 'meter-delhi-solar-001',
      zoneId: 1,
      sourceType: SourceType.SOLAR_PV,
      ratedCapacityW: 8000n,
    });

    const reading = sim.emitReading(48, fault);
    if ('original' in reading) {
      // Equivocation fault: two conflicting readings for same interval
      setIsValid(false);
      setStatusMessage('EQUIVOCATION DETECTED: Slashing proof generated against meter public key. Two signed states emitted for Interval 48.');
      setHashOutput('0xSLASH-EQUIV-48');
    } else {
      const valid = verifyEd25519(reading.signature, reading.rawPayloadBytes, reading.publicKey);
      setIsValid(valid);
      if (!valid) {
        setStatusMessage('SIGNATURE MISMATCH: Ed25519 cryptographic payload bytes do not verify against registered public key. Reading rejected.');
        setHashOutput('0xREJECTED-TAMPERED');
      } else if (fault === SimulatedFault.REPLAY_COUNTER) {
        setIsValid(false);
        setStatusMessage('REPLAY COUNTER REJECTED: Reading counter #141 <= previous committed counter #141. Monotonic violation.');
        setHashOutput('0xREJECTED-REPLAY');
      } else if (fault === SimulatedFault.CAPACITY_EXCEEDED) {
        setIsValid(false);
        setStatusMessage('PHYSICAL CAPACITY EXCEEDED: Meter reported 9,400 Wh for 8,000 W inverter. Physical laws violated.');
        setHashOutput('0xREJECTED-OVERCAPACITY');
      } else {
        setStatusMessage('CLEAN ATTESTATION: Ed25519 verified, monotonic counter valid, physical capacity verified. Leaf accepted into Merkle tree.');
        setHashOutput('0x41ab98f2c...89e1');
      }
    }
  };

  return (
    <section id="verification" className="py-20 px-4 sm:px-6 max-w-7xl mx-auto border-t border-zinc-800">
      <div className="space-y-2 mb-10">
        <div className="text-[11px] font-mono text-emerald-400 uppercase tracking-wider font-semibold">
          07 · CRYPTOGRAPHIC PROVENANCE
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white uppercase font-sans">
          Trust the Reading. Verify the Record.
        </h2>
        <p className="text-sm text-zinc-400 font-mono max-w-2xl">
          Zero-trust physical metering through hardware secure elements, RFC 6962 binary Merkle trees, and multi-institutional threshold signatures.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Cryptographic Flow Architecture */}
        <div className="lg:col-span-7 border border-zinc-800 bg-[#121215] p-5 font-mono text-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="font-bold text-white text-sm">PROVENANCE VERIFICATION PIPELINE</span>
            <span className="text-[10px] text-zinc-500">RFC 6962 BINARY TREE</span>
          </div>

          <div className="space-y-3">
            {[
              { step: '01', title: 'DLMS/COSEM TELEMETRY READ', desc: '1,250 Wh measured at distribution boundary point' },
              { step: '02', title: 'ED25519 ASYMMETRIC SIGNATURE', desc: 'Hardware Secure Element (ATECC608B) signs 64-byte payload' },
              { step: '03', title: 'CANONICAL MERKLE LEAF HASH', desc: 'Keccak-256(0x00 || deviceId || zone || interval || energy || counter)' },
              { step: '04', title: 'BINARY SIBLING MERKLE PROOF', desc: 'Leaves paired hierarchically with pre-image collision protection' },
              { step: '05', title: '3-OF-3 ORACLE THRESHOLD COMMIT', desc: 'DISCOM, CERC, and DEX nodes witness root to EpochOracle.sol' },
            ].map((st, i) => (
              <div key={i} className="p-2.5 bg-zinc-950 border border-zinc-800/80 rounded-sm flex items-start space-x-3">
                <span className="text-emerald-400 font-bold shrink-0">{st.step}</span>
                <div>
                  <div className="text-white font-semibold text-xs">{st.title}</div>
                  <div className="text-[11px] text-zinc-400 mt-0.5">{st.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Live Hardware Attack Vector Testing Lab */}
        <div className="lg:col-span-5 border border-zinc-800 bg-[#121215] p-5 font-mono text-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <span className="font-bold text-white text-sm">HARDWARE SECURITY TESTING LAB</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border flex items-center gap-1 ${
                isValid
                  ? 'bg-emerald-950/70 border-emerald-800 text-emerald-400'
                  : 'bg-rose-950/70 border-rose-800 text-rose-400'
              }`}>
                {isValid ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                {isValid ? 'VERIFIED NOMINAL' : 'ATTACK REJECTED'}
              </span>
            </div>

            <p className="text-zinc-400 text-xs mt-3 leading-relaxed">
              Inject active adversarial faults into the simulated physical meter to verify non-repudiation and cryptographic slashing defenses.
            </p>

            {/* Fault Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
              <button
                onClick={() => handleTestFault(SimulatedFault.NONE)}
                className={`p-2 text-left rounded border transition-colors ${
                  activeFault === SimulatedFault.NONE
                    ? 'bg-zinc-800 border-emerald-500 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <div className="font-bold text-xs">0. NOMINAL</div>
                <div className="text-[10px] text-zinc-500">Valid attestation</div>
              </button>

              <button
                onClick={() => handleTestFault(SimulatedFault.EQUIVOCATION)}
                className={`p-2 text-left rounded border transition-colors ${
                  activeFault === SimulatedFault.EQUIVOCATION
                    ? 'bg-rose-950/70 border-rose-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-rose-300'
                }`}
              >
                <div className="font-bold text-xs">1. EQUIVOCATION</div>
                <div className="text-[10px] text-zinc-500">Forked readings</div>
              </button>

              <button
                onClick={() => handleTestFault(SimulatedFault.REPLAY_COUNTER)}
                className={`p-2 text-left rounded border transition-colors ${
                  activeFault === SimulatedFault.REPLAY_COUNTER
                    ? 'bg-rose-950/70 border-rose-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-rose-300'
                }`}
              >
                <div className="font-bold text-xs">2. REPLAY ATTACK</div>
                <div className="text-[10px] text-zinc-500">Duplicate nonce</div>
              </button>

              <button
                onClick={() => handleTestFault(SimulatedFault.TAMPERED_PAYLOAD)}
                className={`p-2 text-left rounded border transition-colors ${
                  activeFault === SimulatedFault.TAMPERED_PAYLOAD
                    ? 'bg-rose-950/70 border-rose-600 text-white'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-rose-300'
                }`}
              >
                <div className="font-bold text-xs">3. TAMPERED DATA</div>
                <div className="text-[10px] text-zinc-500">Bit flip attack</div>
              </button>
            </div>

            {/* Result Box */}
            <div className={`mt-4 p-3 rounded-sm border space-y-1 ${
              isValid
                ? 'bg-zinc-950 border-zinc-800'
                : 'bg-rose-950/30 border-rose-900 text-rose-300'
            }`}>
              <div className="text-[10px] text-zinc-500">SECURITY AUDIT DIAGNOSTIC:</div>
              <div className="text-xs leading-relaxed font-semibold">{statusMessage}</div>
              <div className="text-[10px] text-zinc-500 pt-1">Resulting Root Commitment: <span className="text-white font-mono">{hashOutput}</span></div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-800 text-[11px] text-zinc-500 flex justify-between">
            <span>DEVICE REGISTRY CONTRACT</span>
            <span>PUBLIC KEY PINNED ON-CHAIN</span>
          </div>
        </div>
      </div>
    </section>
  );
};
