import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Play, Pause, RotateCcw, Layers, Cpu, Radio, Shield, Award, CheckCircle2 } from 'lucide-react';

export type EngineMode = 'SYSTEM' | 'ARCHITECTURE' | 'STATIONS' | 'ONE_TRANSACTION';

export const EnergyExchange3D: React.FC = () => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [activeMode, setActiveMode] = useState<EngineMode>('SYSTEM');
  const [selectedStation, setSelectedStation] = useState<number>(0);
  const [isPlayingTx, setIsPlayingTx] = useState<boolean>(true);
  const [txProgress, setTxProgress] = useState<number>(0);

  const stationsMeta = [
    { id: 0, num: '01', name: 'GENERATION', desc: 'Solar Inverter Photon Conversion & Metering', color: '#f59e0b' },
    { id: 1, num: '02', name: 'ATTESTATION', desc: 'ATECC608B Hardware RoT Ed25519 Signing', color: '#06b6d4' },
    { id: 2, num: '03', name: 'ORACLE QUORUM', desc: '3-of-3 Multi-Operator Merkle Consensus', color: '#22c55e' },
    { id: 3, num: '04', name: 'MARKET ENGINE', desc: 'Discrete Zonal Call Auction (k = 0.5 Midpoint)', color: '#a855f7' },
    { id: 4, num: '05', name: 'SETTLEMENT', desc: 'Atomic Escrow Netting & Cash Payouts', color: '#3b82f6' },
    { id: 5, num: '06', name: 'CERTIFICATE VAULT', desc: 'ERC-1155 GAC Token Minting & Nullifier Burn', color: '#10b981' },
  ];

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene, Camera, Renderer
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = null; // Transparent

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 5.5, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xdcfce7, 2.2);
    keyLight.position.set(8, 12, 10);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    fillLight.position.set(-10, 6, -8);
    scene.add(fillLight);

    // 3. Materials
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      metalness: 0.85,
      roughness: 0.25,
    });

    const conduitMat = new THREE.MeshStandardMaterial({
      color: 0x27272a,
      metalness: 0.9,
      roughness: 0.2,
    });

    // 4. Build the 6 Stations
    const stationsGroup = new THREE.Group();
    scene.add(stationsGroup);

    const stationObjects: THREE.Group[] = [];
    const stationSpacing = 2.8;
    const totalStations = 6;
    const startX = -((totalStations - 1) * stationSpacing) / 2;

    // Station 1: Generation (Photovoltaic tiers)
    const st1 = new THREE.Group();
    st1.position.x = startX;
    const pvBase = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 1.8), darkMetalMat);
    st1.add(pvBase);
    const pvTier = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.15, 1.5),
      new THREE.MeshStandardMaterial({ color: 0x09090b, metalness: 0.9, roughness: 0.1 })
    );
    pvTier.position.y = 0.25;
    st1.add(pvTier);
    const solarCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.8, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.2 })
    );
    solarCore.position.y = 0.7;
    st1.add(solarCore);
    stationObjects.push(st1);
    stationsGroup.add(st1);

    // Station 2: Attestation (Enclave Cabinet)
    const st2 = new THREE.Group();
    st2.position.x = startX + stationSpacing;
    const cabBase = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), darkMetalMat);
    st2.add(cabBase);
    const cabTower = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 1.0), darkMetalMat);
    cabTower.position.y = 0.9;
    st2.add(cabTower);
    const chipLight = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.6, 1.05),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 1.5 })
    );
    chipLight.position.y = 0.9;
    st2.add(chipLight);
    stationObjects.push(st2);
    stationsGroup.add(st2);

    // Station 3: Oracle Quorum (Tri-Spire)
    const st3 = new THREE.Group();
    st3.position.x = startX + stationSpacing * 2;
    const oracleBase = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.4, 6), darkMetalMat);
    st3.add(oracleBase);
    // 3 Monoliths around center
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const spire = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.25), darkMetalMat);
      spire.position.set(Math.cos(angle) * 0.55, 0.9, Math.sin(angle) * 0.55);
      st3.add(spire);
    }
    const oracleCenter = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 16),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.6 })
    );
    oracleCenter.position.y = 0.9;
    st3.add(oracleCenter);
    stationObjects.push(st3);
    stationsGroup.add(st3);

    // Station 4: Market Engine (Auction Core)
    const st4 = new THREE.Group();
    st4.position.x = startX + stationSpacing * 3;
    const mktBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), darkMetalMat);
    st4.add(mktBase);
    const ringUpper = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.08, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 1.2 })
    );
    ringUpper.rotation.x = Math.PI / 2;
    ringUpper.position.y = 1.1;
    st4.add(ringUpper);
    const ringLower = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.08, 12, 24),
      new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 1.2 })
    );
    ringLower.rotation.x = Math.PI / 2;
    ringLower.position.y = 0.5;
    st4.add(ringLower);
    const mktCore = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 1.2, 16),
      new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0xa855f7, emissiveIntensity: 1.0 })
    );
    mktCore.position.y = 0.8;
    st4.add(mktCore);
    stationObjects.push(st4);
    stationsGroup.add(st4);

    // Station 5: Settlement (Hydraulic Escrow)
    const st5 = new THREE.Group();
    st5.position.x = startX + stationSpacing * 4;
    const escBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.4), darkMetalMat);
    st5.add(escBase);
    const chamberLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 16), darkMetalMat);
    chamberLeft.position.set(-0.4, 0.8, 0);
    st5.add(chamberLeft);
    const chamberRight = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 16), darkMetalMat);
    chamberRight.position.set(0.4, 0.8, 0);
    st5.add(chamberRight);
    const escPipe = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.15, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x3b82f6, emissiveIntensity: 1.4 })
    );
    escPipe.position.y = 0.9;
    st5.add(escPipe);
    stationObjects.push(st5);
    stationsGroup.add(st5);

    // Station 6: Certificate Vault (Prismatic Gem Rack)
    const st6 = new THREE.Group();
    st6.position.x = startX + stationSpacing * 5;
    const certBase = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 1.6), darkMetalMat);
    st6.add(certBase);
    const certGem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.6, 0),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 1.5,
        roughness: 0.1,
        metalness: 0.8,
      })
    );
    certGem.position.y = 0.9;
    st6.add(certGem);
    stationObjects.push(st6);
    stationsGroup.add(st6);

    // Continuous Transmission Conduit along bottom
    const mainBusbar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, totalStations * stationSpacing + 0.4, 16),
      conduitMat
    );
    mainBusbar.rotation.z = Math.PI / 2;
    mainBusbar.position.set(0, -0.1, 0);
    stationsGroup.add(mainBusbar);

    // 5. Active Transaction Particle Sphere (for ONE TRANSACTION mode)
    const txPacket = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    const txGlow = new THREE.PointLight(0x22c55e, 3.5, 4);
    txPacket.add(txGlow);
    scene.add(txPacket);

    // Ambient floating particles
    const particleCount = 40;
    const particleGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArray[i] = (Math.random() - 0.5) * 16;
      posArray[i + 1] = Math.random() * 4 + 0.2;
      posArray[i + 2] = (Math.random() - 0.5) * 6;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.08,
      color: 0x22c55e,
      transparent: true,
      opacity: 0.6,
    });
    const particleCloud = new THREE.Points(particleGeo, particleMat);
    scene.add(particleCloud);

    // Mouse drag interaction
    let isDragging = false;
    let prevMouseX = 0;
    let targetRotationY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - prevMouseX;
      targetRotationY += deltaX * 0.005;
      prevMouseX = e.clientX;
    };
    const handleMouseUp = () => {
      isDragging = false;
    };
    container.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // Animation Loop
    let animId: number;
    let clock = new THREE.Clock();
    let txTime = 0;

    const animate = () => {
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      // Smooth rotate group
      stationsGroup.rotation.y += (targetRotationY - stationsGroup.rotation.y) * 0.08;

      // Pulse active cores
      solarCore.rotation.y += 0.02;
      oracleCenter.rotation.y += 0.03;
      ringUpper.rotation.z += 0.03;
      ringLower.rotation.z -= 0.03;
      certGem.rotation.y += 0.015;
      certGem.rotation.x = Math.sin(elapsed * 2) * 0.15;

      // Mode-specific layouts & Camera adjustments
      if (activeMode === 'SYSTEM') {
        camera.position.lerp(new THREE.Vector3(0, 4.8, 13.5), 0.05);
        camera.lookAt(0, 0.6, 0);

        // Reset positions
        stationObjects.forEach((st, idx) => {
          st.position.y = THREE.MathUtils.lerp(st.position.y, 0, 0.1);
          st.position.z = THREE.MathUtils.lerp(st.position.z, 0, 0.1);
        });
      } else if (activeMode === 'ARCHITECTURE') {
        camera.position.lerp(new THREE.Vector3(0, 7.5, 15), 0.05);
        camera.lookAt(0, 1.2, 0);

        // Explode vertically into layers
        stationObjects.forEach((st, idx) => {
          const layerOffset = idx % 2 === 0 ? 1.0 : -0.6;
          st.position.y = THREE.MathUtils.lerp(st.position.y, layerOffset, 0.08);
          st.position.z = THREE.MathUtils.lerp(st.position.z, idx * 0.2 - 0.5, 0.08);
        });
      } else if (activeMode === 'STATIONS') {
        const targetX = startX + selectedStation * stationSpacing;
        camera.position.lerp(new THREE.Vector3(targetX, 3.2, 6.5), 0.05);
        camera.lookAt(targetX, 0.8, 0);

        stationObjects.forEach((st, idx) => {
          st.position.y = THREE.MathUtils.lerp(st.position.y, 0, 0.1);
          st.position.z = THREE.MathUtils.lerp(st.position.z, 0, 0.1);
        });
      } else if (activeMode === 'ONE_TRANSACTION') {
        // Follow transaction packet
        if (isPlayingTx) {
          txTime += delta * 0.45;
          const progress = (txTime % 1.0);
          setTxProgress(progress);

          // Path along stations from startX to endX
          const totalDist = (totalStations - 1) * stationSpacing;
          const currentX = startX + progress * totalDist;
          const currentY = 0.8 + Math.sin(progress * Math.PI * 10) * 0.2;
          txPacket.position.set(currentX, currentY, 0);

          // Color change based on station stage
          const currentStationIdx = Math.min(5, Math.floor(progress * 6));
          if (currentStationIdx === 0) txGlow.color.setHex(0xf59e0b);
          else if (currentStationIdx === 1) txGlow.color.setHex(0x06b6d4);
          else if (currentStationIdx === 2) txGlow.color.setHex(0x22c55e);
          else if (currentStationIdx === 3) txGlow.color.setHex(0xa855f7);
          else if (currentStationIdx === 4) txGlow.color.setHex(0x3b82f6);
          else txGlow.color.setHex(0x10b981);

          camera.position.lerp(new THREE.Vector3(currentX, 3.5, 8.5), 0.08);
          camera.lookAt(currentX, 0.8, 0);
        }
      }

      // Hide/Show tx packet when not in one_tx mode
      txPacket.visible = activeMode === 'ONE_TRANSACTION';

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      container.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [activeMode, selectedStation, isPlayingTx]);

  return (
    <div className="relative w-full h-[540px] bg-gradient-to-b from-[#09090b] via-[#121215] to-[#09090b] border border-zinc-800 rounded-none overflow-hidden select-none">
      {/* 3D Canvas Mounting Container */}
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top Header Mode HUD */}
      <div className="absolute top-3 left-4 right-4 flex flex-wrap items-center justify-between gap-3 font-mono text-xs pointer-events-none">
        <div className="bg-zinc-950/80 border border-zinc-800 px-3 py-1.5 rounded-sm flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="font-bold text-white tracking-wider">ENERGY EXCHANGE ENGINE</span>
          <span className="text-zinc-500">· 6 STATIONS</span>
        </div>

        {/* 4 Mode Buttons */}
        <div className="flex bg-zinc-950 border border-zinc-800 rounded-sm p-0.5 pointer-events-auto">
          {[
            { id: 'SYSTEM' as EngineMode, label: 'SYSTEM' },
            { id: 'ARCHITECTURE' as EngineMode, label: 'ARCHITECTURE' },
            { id: 'STATIONS' as EngineMode, label: 'STATIONS' },
            { id: 'ONE_TRANSACTION' as EngineMode, label: 'ONE TRANSACTION' },
          ].map((mode) => (
            <button
              key={mode.id}
              onClick={() => setActiveMode(mode.id)}
              className={`px-2.5 py-1 text-[11px] font-semibold transition-colors rounded-sm ${
                activeMode === mode.id
                  ? 'bg-zinc-800 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* STATIONS Mode Selector Bar */}
      {activeMode === 'STATIONS' && (
        <div className="absolute top-14 left-4 right-4 flex items-center justify-center space-x-1 font-mono text-[11px] overflow-x-auto p-1 bg-zinc-950/90 border border-zinc-800 rounded-sm">
          {stationsMeta.map((st) => (
            <button
              key={st.id}
              onClick={() => setSelectedStation(st.id)}
              className={`px-2 py-1 rounded-sm whitespace-nowrap transition-colors flex items-center space-x-1.5 ${
                selectedStation === st.id
                  ? 'bg-zinc-800 text-white border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <span className="text-[9px] text-zinc-500">{st.num}</span>
              <span style={{ color: selectedStation === st.id ? st.color : undefined }}>{st.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* ONE TRANSACTION Telemetry HUD */}
      {activeMode === 'ONE_TRANSACTION' && (
        <div className="absolute bottom-16 left-4 right-4 bg-zinc-950/90 border border-zinc-800 p-3 rounded-sm font-mono text-xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsPlayingTx(!isPlayingTx)}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded transition-colors"
            >
              {isPlayingTx ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">TRACE PACKET #TX-48092</div>
              <div className="text-white font-bold text-xs mt-0.5">
                {txProgress < 0.17
                  ? 'Stage 1: Inverter Reading (1,250 Wh Generated)'
                  : txProgress < 0.34
                  ? 'Stage 2: Hardware Enclave (Ed25519 Signed)'
                  : txProgress < 0.51
                  ? 'Stage 3: 3-of-3 Oracle Quorum Reached'
                  : txProgress < 0.68
                  ? 'Stage 4: Call Auction Cleared (₹4.50 / kWh)'
                  : txProgress < 0.85
                  ? 'Stage 5: Escrow Net Cash Reconciled (₹9.00)'
                  : 'Stage 6: GAC ERC-1155 Token Minted'}
              </div>
            </div>
          </div>

          <div className="w-48 bg-zinc-900 h-2 rounded-none overflow-hidden border border-zinc-800">
            <div
              className="bg-emerald-500 h-full transition-all duration-75"
              style={{ width: `${Math.round(txProgress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Bottom Instructions / Info Banner */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-[11px] font-mono text-zinc-500 pointer-events-none">
        <span>CLICK & DRAG TO ORBIT 360°</span>
        <span>
          {activeMode === 'STATIONS'
            ? stationsMeta[selectedStation].desc
            : 'PRECISION ENERGY INFRASTRUCTURE MACHINE'}
        </span>
      </div>
    </div>
  );
};
