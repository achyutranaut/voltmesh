# Energy Exchange Engine (3D Interactive Infrastructure Experience)

## 1. Overview & Purpose

The **Energy Exchange Engine** is a high-fidelity, interactive 3D technical model embodying the six physical, cryptographic, and financial clearing stages of the Decentralized Energy Exchange (DEX). 

Rather than presenting an abstract flowchart or a generic factory metaphor, this component serves as a **kinetic physical model of the protocol architecture**:
- Demonstrates how solar electrons physically flow from decentralized prosumer photovoltaics into hardware secure elements.
- Visualizes how asymmetric cryptographic attestations (Ed25519) are aggregated into decentralized multi-operator oracle quorums (DISCOM MDMS, DERC Regulator, Independent Auditor).
- Explains the deterministic discrete call auction ($k = 0.5$ midpoint clearing) matching supply and demand.
- Depicts T+1 atomic escrow netting and automated Granular Attestation Certificate (GAC) minting with permanent nullifier burn.

---

## 2. Component Architecture

The experience is modularized under `src/components/energy-exchange-engine/`:

```
apps/web/src/components/energy-exchange-engine/
├── EnergyExchangeEngine.tsx     # Root orchestration container, state manager & HUD
├── EnergyEngineScene.tsx        # Procedural Three.js scene, OrbitControls, materials, lighting & WebGL context
├── EnergyEngineControls.tsx     # Mode selector (SYSTEM, ARCHITECTURE, STATIONS, ONE TX) & camera viewpoints
├── EnergyEngineOverlay.tsx      # Technical HUD coordinates, grid watermark, and accessibility aria tree
├── EnergyEngineStation.tsx      # Metadata registry and drill-down inspection modal for the 6 stations
├── EnergyFlow.tsx               # Procedural spline busbar network and instanced kinetic energy pulses
├── TransactionJourney.tsx       # Live microsecond telemetry ticker for the ONE TRANSACTION walkthrough
└── energy-engine.css            # Scoped CSS styling isolating the 3D canvas and HUD
```

Additionally, `@/components/ui/energy-exchange-3d.tsx` and `@/components/ui/agentic-factory-3d.tsx` are provided in `components/ui` for standards compliance and reusable UI component ergonomics.

---

## 3. The Six Energy Stations

| Station # | Stage Name | Visual Metaphor | Inputs | Primary Process | Outputs |
|---|---|---|---|---|---|
| **01** | **GENERATION** | Inverter chamber, angled photovoltaic array, dual copper induction coils | Solar radiation flux | DC-to-AC power inversion & CT current measurement | Raw active power pulses (kWh) |
| **02** | **ATTESTATION** | Utility meter enclosure, live procedural LCD screen, secure enclave diode | Instantaneous kW telemetry | ATECC608B Root-of-Trust Ed25519 asymmetric signature | Signed Attestation Envelope |
| **03** | **ORACLE QUORUM** | Tri-operator server spires, rotating Merkle Root sphere, concentric copper rings | Signed meter envelopes | 3-of-3 quorum consensus across DISCOM, DERC, and Auditor | Committed Epoch Merkle Root |
| **04** | **CALL MARKET** | Auction core with counter-rotating supply/demand rings & order ledger display | EIP-712 signed bids & asks | $k = 0.5$ midpoint uniform-price double auction | Uniform clearing price & bilateral obligations |
| **05** | **SETTLEMENT** | Dual pressurized escrow cylinders, bridging copper conduit, settlement receipt | Matched obligations + AMI true-up | Bilateral escrow netting & DISCOM statement credit | Atomic financial settlement batch |
| **06** | **CERTIFICATE** | Metallic gantry, floating green octahedral crystal, orbital provenance rings | Epoch Merkle inclusion proof | ERC-1155 GAC token minting & cryptographic nullifier burn | Irrevocable green certificate |

---

## 4. Operational Modes

1. **SYSTEM (Default)**:
   - Full connected mechanism operating synchronously.
   - Shows continuous energy flow along primary copper busbars with instanced pulses.
   - Smooth auto-damping OrbitControls for 360° rotation and zoom.

2. **ARCHITECTURE (Exploded Cutaway)**:
   - Activates local clipping plane at platform height.
   - Vertically separates layers to reveal internal electrical gears, pneumatic lines, and busbar routing.
   - Enables structural comprehension of how the physical grid connects to the cryptographic ledger.

3. **STATIONS (Inspection Focus)**:
   - Smoothly glides the camera to focus on an individual station.
   - Projects 3D anchor points to floating 2D HUD label pins.
   - Opens the detailed Station Inspection Modal displaying field specifications, inputs, processes, and outputs.

4. **ONE TRANSACTION (Telemetry Journey)**:
   - Tracks a single glowing energy quantum packet traversing from Station 01 through Station 06.
   - Displays real-time microsecond timestamp ticker (`04:32:18.102` through `04:32:19.320`).
   - Dynamic packet illumination shifts color matching each protocol stage (Amber → Cyan → Green → Purple → Blue → Emerald).

---

## 5. Props & Application State Integration

`EnergyExchangeEngine` accepts props allowing live linkage to the trading platform:

```tsx
interface EnergyExchangeEngineProps {
  height?: number | string;            // Canvas height (default: 640px)
  className?: string;                  // Outer container styling
  zone?: string;                       // e.g. "DL-TPDDL-Z1"
  intervalIdx?: number;                // Current 15-min interval (0..95)
  clearingPricePaise?: number;         // Active market clearing price (e.g. 450)
  onStationSelect?: (id: EnergyStationId) => void; // Station click callback
}
```

---

## 6. Performance & WebGL Optimizations

- **Resource Disposal**: Complete cleanup on component unmount of all geometries, materials, procedural canvas textures, and WebGL contexts (`renderer.forceContextLoss()`).
- **Dynamic Draw Instancing**: Uses `THREE.InstancedMesh` with `DynamicDrawUsage` for the 72 energy pulses, keeping draw calls minimal (< 45 calls per frame).
- **Reduced Motion Support**: Inspects `prefers-reduced-motion: reduce` to eliminate disorienting camera movements and rapid rotations.
- **Pixel Ratio Clamping**: Caps `devicePixelRatio` to 1.8 to prevent GPU thermal throttling on high-DPI displays.
- **Context Loss Resilience**: Listens for `webglcontextlost` and `webglcontextrestored` to gracefully recover graphics state without crash.

---

## 7. Accessibility & Mobile Behavior

- **Screen-Reader Compatibility**: Includes a hidden `.sr-only` semantic `<ol>` document tree describing each station's technical function for non-visual users.
- **Touch Gestures**: Single-finger drag rotates the machine; page scroll is preserved when scrolling past the component on mobile viewports.
- **Responsive Layout**: On mobile screens (`<= 768px`), height adapts to 520px, HUD control buttons stack compactly, and the station inspection modal transforms into a bottom-docked sheet.
