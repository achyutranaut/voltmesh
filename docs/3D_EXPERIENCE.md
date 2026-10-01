# 3D Experience Specification: The Energy Exchange Engine

**Document Version:** 1.0.0  
**Domain:** Abstract Physical Infrastructure Visualization  
**Technology:** Three.js / WebGL / React Three Fiber / Custom GLSL Shaders

---

## 1. Domain Transformation: From "AI Factory" to "Energy Infrastructure Engine"

We completely discard all juvenile "Agentic Factory", "Idea to Payment", and AI-cliché terminology.  
In their place stands the **Energy Exchange Engine**—an abstract physical machine that embodies how software, cryptography, electrical engineering, and financial clearing operate synchronously.

```
                           THE ENERGY EXCHANGE ENGINE
┌─────────────────────────────────────────────────────────────────────────────┐
│ [01]          [02]            [03]         [04]         [05]         [06]   │
│ GENERATION → ATTESTATION → ORACLE QUORUM → MARKET → SETTLEMENT → CERTIFICATE│
│ Inverter      Hardware Enclave 3-of-3 Node Double-Call  Atomic Escrow ERC-1155  │
│ Micro-Grid    ATECC608B RoT   Consensus    Auction     Reconcile     Vault   │
└─────────────────────────────────────────────────────────────────────────────┘
```

The 3D model does not depict a literal brick-and-mortar power plant. It is an **architectural kinetic machine** composed of brushed dark alloy chambers, luminous high-voltage conduits, crystalline cryptographic verification modules, and monolithic settlement blocks.

---

## 2. The Six Infrastructure Stations

### Station 01: Generation (Solar & Storage Array)
- **Physical Metaphor:** Monolithic stepped photovoltaic silicon tiers with pulsating copper busbars and micro-inverter capacitor banks.
- **Visual Materials:** Dark iridescent obsidian wafers (`roughness: 0.15`, `metalness: 0.85`), thin gold circuit tracers, ambient warm solar amber internal illumination (`#f59e0b`).
- **Dynamic State:** Energy pulses surge with variable intensity based on the active solar irradiance curve (e.g. peaking at midday Interval 48).

### Station 02: Attestation (Hardware Secure Element)
- **Physical Metaphor:** Sealed tamper-evident hardware enclave cabinet (representing ATECC608B / TPM 2.0 microchip).
- **Visual Materials:** Matte gunmetal steel shell (`#18181b`) with a central recessed crystalline prism emitting a concentrated beam of cyan cryptographic light (`#06b6d4`).
- **Dynamic State:** When an energy reading passes through, an Ed25519 asymmetric signature rings the cylinder with etched hexadecimal glyphs.

### Station 03: Oracle Quorum (Consensus Node Array)
- **Physical Metaphor:** Three rotating hexagonal monoliths arranged symmetrically around a central vertical spire (representing DISCOM, Regulatory, and DEX nodes).
- **Visual Materials:** Polished dark titanium with vertical luminescent status conduits.
- **Dynamic State:** All three monoliths must project beams inward to the focal point to reach the 3-of-3 threshold; if consensus is reached, the central spire ignites emerald (`#22c55e`).

### Station 04: Market Engine (Call Auction Core)
- **Physical Metaphor:** Symmetrical magnetic accelerator chamber with intersecting upper and lower pricing rails (Demand vs. Supply).
- **Visual Materials:** Heavy cast iron framing with floating luminous magnetic rings (cyan bids above, emerald asks below).
- **Dynamic State:** At gate closure, the magnetic rings compress toward the central midpoint plane ($k = 0.5$), locking the uniform clearing price with a sharp kinetic clamp animation.

### Station 05: Settlement (Atomic Escrow Vault)
- **Physical Metaphor:** Dual-locking hydraulic escrow chambers with interlocking ledger plates and transparent glass conduits showing liquid digital collateral.
- **Visual Materials:** Dark graphite plates with inset gold contact pads and pressure valves (`#3b82f6` settlement illumination).
- **Dynamic State:** As delivery obligations are verified, the hydraulic locks actuate, releasing cleared rupee credits from buyer escrow to seller balance.

### Station 06: Certificate Vault (GAC Environmental Provenance)
- **Physical Metaphor:** Crystalline vault containing floating emerald token facets (ERC-1155 Granular Attribute Certificates).
- **Visual Materials:** Prismatic emerald crystal (`transmission: 0.9`, `ior: 1.52`, `roughness: 0.05`) with internal laser-etched nullifier hashes.
- **Dynamic State:** Minting causes a crystalline facet to illuminate and register in the vault rack; retirement triggers a controlled electrical discharge that nullifies the token permanently.

---

## 3. The Four Interactive Inspection Modes

| Mode | Camera Position & Behavior | Mechanical Geometry State | Informational Overlay |
| :--- | :--- | :--- | :--- |
| **1. SYSTEM** | Wide isometric orbital camera (`theta: 45°`, `phi: 30°`, `dist: 18m`). Smooth 360° user rotation. | All 6 stations assembled together in an integrated linear transmission block. Ambient energy particles circulate continuously. | Overall feeder capacity (kVA), active trading interval, aggregate MWh volume, and system health status. |
| **2. ARCHITECTURE** | Camera pulls back slightly; exploded view triggered along Y and Z axes. | Machine components separate into 3 vertical layers: Physical Grid layer (bottom), Cryptographic Oracle layer (middle), Financial Settlement layer (top). | Component callout labels, busbar bandwidth, cryptographic algorithms, and RPC contract addresses. |
| **3. STATIONS** | Smooth dolly zoom to selected station. Camera locks onto target module with local orbital control. | Focused station remains fully opaque and active; adjacent stations fade to 20% ghosted wireframe opacity. | Detailed station telemetry: sensor readings, public keys, quorum threshold counts, order matching curves, token IDs. |
| **4. ONE TRANSACTION** | Cinematic tracking camera that follows a single energy token packet through the machine. | Stations sequentially activate and pulse as the discrete energy packet arrives and is processed. | Real-time transaction HUD showing current state: `Reading (1250 Wh)` $\to$ `Signed (Ed25519)` $\to$ `Quorum (3/3)` $\to$ `Cleared (₹4.50)` $\to$ `Escrow Settled` $\to$ `GAC Minted`. |

---

## 4. Materials, Lighting & Visual Rendering Pipeline

```
┌────────────────────────────────────────────────────────┐
│ THREE.JS WEBGL RENDERER                                │
│ Tone Mapping: ACESFilmicToneMapping (Exposure: 1.05)   │
│ Shadow Map: Soft PCF (PCFSoftShadowMap)                │
│ Background: Transparent / Seamless with #09090b Zinc  │
├────────────────────────────────────────────────────────┤
│ LIGHTING ENVIRONMENT:                                  │
│ - Key Light: DirectionalLight (Cold white, 2.8 int)   │
│ - Fill Light: DirectionalLight (Deep blue, 1.2 int)    │
│ - Rim Light: Sharp grazing backlight (Cyan, 3.5 int)  │
│ - Ambient: Quiescent dark ambient (0.35 int)           │
│ - Local Accents: PointLights at active station cores   │
└────────────────────────────────────────────────────────┘
```

### Material Specifications
- **Dark Titanium Shell:** `MeshStandardMaterial` with `color: #121215`, `roughness: 0.28`, `metalness: 0.92`, `envMapIntensity: 1.2`.
- **Luminescent Energy Conduits:** Emissive materials with custom pulse vertex shaders modulating emissive intensity between $1.0$ and $4.5$ along the spline path.
- **Cryptographic Glass:** Physical transmission material (`roughness: 0.1`, `metalness: 0.1`, `transmission: 0.88`, `thickness: 1.2`, `ior: 1.45`).

---

## 5. Performance, Instancing & Responsive Fallbacks

1. **Geometry Instancing:**
   - Repeated elements (busbars, conduits, crystalline facets, order book depth bars) use `THREE.InstancedMesh` to keep draw calls below **45 calls per frame**.
2. **Dynamic Resolution Scaling:**
   - On devices with DPR $> 1.5$, canvas resolution clamps to a maximum of $1.5\times$ to avoid GPU memory saturation on mobile retina displays.
3. **Mobile & Low-End GPU Fallback:**
   - If WebGL 2.0 is unavailable or FPS drops below $30$, the system automatically switches to an **orthographic SVG vector interactive diagram** that maintains identical interactive station controls and telemetry overlays with zero 3D overhead.
4. **Reduced Motion (`prefers-reduced-motion`):**
   - Disables continuous rotation, camera tracking lerp, and particle drift. Stations remain in clean static exploded diagrams selectable via tab clicks.
