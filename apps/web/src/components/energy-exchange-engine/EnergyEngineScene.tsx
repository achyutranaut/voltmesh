import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ENERGY_STATIONS, StationDefinition, EnergyStationId } from './EnergyEngineStation';
import { createEnergyFlowNetwork, EnergyFlowNetwork } from './EnergyFlow';
import { MachineMode, CameraMode } from './EnergyEngineControls';

export interface SceneHandle {
  setMode: (mode: MachineMode) => void;
  setCamera: (camera: CameraMode) => void;
  focusStation: (id: EnergyStationId) => void;
  play: () => void;
  pause: () => void;
  setProgress: (val: number) => void;
  dispose: () => void;
}

export interface SceneCallbacks {
  onStationClick?: (id: EnergyStationId) => void;
  onStationHover?: (id: EnergyStationId | null) => void;
  onProjectPins?: (pins: { id: EnergyStationId; x: number; y: number }[]) => void;
  onReady?: () => void;
}

export function initEnergyEngineScene(
  container: HTMLElement,
  callbacks: SceneCallbacks
): SceneHandle {
  const cleanups: (() => void)[] = [];
  const getWidth = () => container.clientWidth || 800;
  const getHeight = () => container.clientHeight || 600;

  // 1. Scene, Camera, Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, getWidth() / getHeight(), 0.1, 150);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
  renderer.setSize(getWidth(), getHeight());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;

  container.appendChild(renderer.domElement);

  // 2. Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 8;
  controls.maxDistance = 55;
  controls.minPolarAngle = 0.1;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.rotateSpeed = 0.5;
  controls.zoomSpeed = 0.7;

  // 3. Environment & Lighting
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const env = pmrem.fromScene(room, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.65;
  room.dispose();
  pmrem.dispose();

  scene.add(new THREE.HemisphereLight(0xdbe5f4, 0x181c24, 2.2));

  const keyLight = new THREE.DirectionalLight(0xfff5e6, 4.0);
  keyLight.position.set(-5, 14, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x38bdf8, 2.0);
  fillLight.position.set(6, 6, -8);
  scene.add(fillLight);

  const accentGreen = new THREE.PointLight(0x10b981, 15, 18, 2);
  accentGreen.position.set(0, 4, 3);
  scene.add(accentGreen);

  // 4. Material Palette
  const mat = (color: number, metalness = 0.2, roughness = 0.4, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });

  const M = {
    body: mat(0x27272a, 0.8, 0.28),
    basePlate: mat(0x18181b, 0.88, 0.32),
    dark: mat(0x09090b, 0.6, 0.4),
    chrome: mat(0xd4d4d8, 0.94, 0.18),
    copper: mat(0xc57e45, 0.85, 0.25),
    solarCell: mat(0x0c1e2e, 0.9, 0.15),
    amber: mat(0xf59e0b, 0.5, 0.25),
    emerald: mat(0x10b981, 0.5, 0.25),
    cyan: mat(0x06b6d4, 0.5, 0.25),
    purple: mat(0xa855f7, 0.5, 0.25),
    blue: mat(0x3b82f6, 0.5, 0.25),
    glowGreen: mat(0x10b981, 0.2, 0.2, { emissive: 0x10b981, emissiveIntensity: 2.2 }),
    glowAmber: mat(0xf59e0b, 0.2, 0.2, { emissive: 0xf59e0b, emissiveIntensity: 2.2 }),
    glowCyan: mat(0x06b6d4, 0.2, 0.2, { emissive: 0x06b6d4, emissiveIntensity: 2.2 }),
  };

  // Clipping plane for Architecture/Cutaway mode
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 10);
  const shellMat = (original: THREE.MeshStandardMaterial) => {
    const cloned = original.clone();
    cloned.clippingPlanes = [cutPlane];
    cloned.clipShadows = true;
    cloned.side = THREE.DoubleSide;
    return cloned;
  };
  const S = {
    body: shellMat(M.body),
    basePlate: shellMat(M.basePlate),
    dark: shellMat(M.dark),
  };

  // Helper geometry creators
  const machine = new THREE.Group();
  scene.add(machine);

  function box(
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = M.body,
    r = 0.04
  ) {
    const geo = r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function cyl(
    parent: THREE.Object3D,
    radius: number,
    height: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = M.chrome,
    segments = 24
  ) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, segments);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // 5. Heavy Industrial Chamfered Platform
  box(machine, 14.2, 0.42, 8.8, 0, -0.1, 0, M.basePlate, 0.18);
  box(machine, 13.9, 0.06, 8.5, 0, 0.15, 0, M.chrome, 0.1);
  box(machine, 13.7, 0.09, 8.3, 0, 0.22, 0, M.body, 0.08);

  // Rubber mounts & captive screws
  for (const x of [-6.2, 6.2]) {
    for (const z of [-3.7, 3.7]) {
      cyl(machine, 0.4, 0.28, x, -0.32, z, M.dark);
      cyl(machine, 0.06, 0.03, x, 0.28, z, M.chrome);
    }
  }

  // Engraved Metadata Front Nameplate
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 1536;
  plateCanvas.height = 180;
  const pctx = plateCanvas.getContext('2d')!;
  pctx.fillStyle = '#12151b';
  pctx.fillRect(0, 0, 1536, 180);
  pctx.strokeStyle = '#27272a';
  pctx.lineWidth = 3;
  pctx.strokeRect(4, 4, 1528, 172);
  pctx.fillStyle = '#10b981';
  pctx.font = 'bold 36px monospace';
  pctx.fillText('DECENTRALIZED ENERGY EXCHANGE', 45, 75);
  pctx.fillStyle = '#a1a1aa';
  pctx.font = '24px monospace';
  pctx.fillText('· 6-STAGE PHYSICAL & CRYPTOGRAPHIC CLEARING INFRASTRUCTURE', 680, 75);
  pctx.fillStyle = '#71717a';
  pctx.font = '20px monospace';
  pctx.fillText('ZONE DL-TPDDL-Z1 · DERC PILOT SPECIFICATION · INTERVAL 48 · STATUS: OPERATIONAL', 45, 130);
  pctx.fillStyle = '#10b981';
  pctx.fillText('ENGINE V1.1', 1370, 130);

  const plateTex = new THREE.CanvasTexture(plateCanvas);
  plateTex.colorSpace = THREE.SRGBColorSpace;
  const nameplate = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 0.95),
    new THREE.MeshBasicMaterial({ map: plateTex })
  );
  nameplate.rotation.x = -Math.PI / 2;
  nameplate.position.set(0, 0.27, 3.65);
  machine.add(nameplate);

  // Radial technical drafting marks
  const draftingPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    const r1 = 8.5;
    const r2 = 8.5 + (i % 5 === 0 ? 0.35 : 0.15);
    draftingPoints.push(
      new THREE.Vector3(Math.cos(a) * r1, -0.38, Math.sin(a) * r1 * 0.75),
      new THREE.Vector3(Math.cos(a) * r2, -0.38, Math.sin(a) * r2 * 0.75)
    );
  }
  const draftingLines = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(draftingPoints),
    new THREE.LineBasicMaterial({ color: 0x27272a, transparent: true, opacity: 0.3 })
  );
  scene.add(draftingLines);

  // 6. Build the 6 Specialized Energy Stations
  interface StationObject {
    def: StationDefinition;
    group: THREE.Group;
    basePos: THREE.Vector3;
    glowMat: THREE.MeshStandardMaterial;
    pickable: THREE.Object3D;
    animatedProps: {
      rotators?: THREE.Object3D[];
      pulseGems?: THREE.Object3D[];
    };
  }

  const stationObjects: StationObject[] = [];

  ENERGY_STATIONS.forEach((def) => {
    const group = new THREE.Group();
    group.position.fromArray(def.pos);
    machine.add(group);

    // Station Base Pedestal
    const glowMat = def.color === '#f59e0b' ? M.glowAmber : def.color === '#06b6d4' ? M.glowCyan : M.glowGreen;
    box(group, 2.1, 0.14, 1.8, 0, 0.04, 0, M.dark, 0.08);
    box(group, 2.02, 0.04, 1.72, 0, 0.12, 0, glowMat, 0.06);
    box(group, 2.08, 0.16, 1.76, 0, 0.22, 0, M.body, 0.08);

    // Name badge on front of station
    const badgeCanvas = document.createElement('canvas');
    badgeCanvas.width = 440;
    badgeCanvas.height = 110;
    const bctx = badgeCanvas.getContext('2d')!;
    bctx.fillStyle = '#09090b';
    bctx.fillRect(0, 0, 440, 110);
    bctx.fillStyle = def.color;
    bctx.font = 'bold 38px monospace';
    bctx.fillText(def.number, 20, 72);
    bctx.fillStyle = '#ffffff';
    bctx.fillText(def.name, 95, 70);
    const badgeTex = new THREE.CanvasTexture(badgeCanvas);
    const badgeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 0.35),
      new THREE.MeshBasicMaterial({ map: badgeTex })
    );
    badgeMesh.position.set(0, 0.26, 0.89);
    group.add(badgeMesh);

    const rotators: THREE.Object3D[] = [];
    const pulseGems: THREE.Object3D[] = [];

    // CUSTOM STATION-SPECIFIC VISUAL GEOMETRY
    if (def.id === 'generation') {
      // 01 GENERATION: Solar PV Array + Inverter Chamber
      const invBody = box(group, 1.7, 0.9, 1.2, 0, 0.75, -0.15, S.body, 0.1);
      // Angled solar collector panel
      const pvRack = new THREE.Group();
      pvRack.position.set(0, 1.3, -0.1);
      pvRack.rotation.x = -0.35;
      group.add(pvRack);
      box(pvRack, 1.8, 0.08, 1.4, 0, 0, 0, M.solarCell, 0.02);
      // Dual induction cooling cylinders
      const c1 = cyl(group, 0.28, 0.8, -0.6, 0.8, -0.2, M.copper);
      const c2 = cyl(group, 0.28, 0.8, 0.6, 0.8, -0.2, M.copper);
      rotators.push(c1, c2);
    } else if (def.id === 'attestation') {
      // 02 ATTESTATION: Smart Meter Housing + Screen + Secure Element LED
      box(group, 1.6, 1.2, 1.1, 0, 0.9, -0.1, S.body, 0.1);
      // Meter LCD Display
      const meterCanvas = document.createElement('canvas');
      meterCanvas.width = 512;
      meterCanvas.height = 320;
      const mctx = meterCanvas.getContext('2d')!;
      mctx.fillStyle = '#06131c';
      mctx.fillRect(0, 0, 512, 320);
      mctx.fillStyle = '#06b6d4';
      mctx.font = 'bold 32px monospace';
      mctx.fillText('AMI SMART METER', 30, 55);
      mctx.fillStyle = '#ffffff';
      mctx.font = '24px monospace';
      mctx.fillText('ACTIVE: 1,250 Wh', 30, 115);
      mctx.fillText('RATE: 5.0 kW PEAK', 30, 160);
      mctx.fillStyle = '#10b981';
      mctx.fillText('Ed25519 SIGNED ✓', 30, 220);
      mctx.fillStyle = '#71717a';
      mctx.font = '18px monospace';
      mctx.fillText('NONCE: #0000008E · SECURE ROT', 30, 275);
      const meterTex = new THREE.CanvasTexture(meterCanvas);
      const display = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.8),
        new THREE.MeshBasicMaterial({ map: meterTex })
      );
      display.position.set(0, 0.95, 0.46);
      group.add(display);
      // Enclave status diode
      const diode = cyl(group, 0.06, 0.06, 0.6, 1.4, 0.46, M.glowCyan);
      pulseGems.push(diode);
    } else if (def.id === 'oracle') {
      // 03 ORACLE QUORUM: Tri-operator Consensus Spires + Concentric Rings
      box(group, 1.7, 0.3, 1.5, 0, 0.45, 0, S.body, 0.08);
      // 3 Spires around center
      for (let i = 0; i < 3; i++) {
        const ang = (i * Math.PI * 2) / 3;
        const sp = box(group, 0.28, 1.6, 0.28, Math.cos(ang) * 0.6, 1.2, Math.sin(ang) * 0.6, M.chrome, 0.02);
        rotators.push(sp);
      }
      // Central rotating Merkle Root sphere
      const merkleSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 20, 20),
        M.glowGreen
      );
      merkleSphere.position.set(0, 1.25, 0);
      group.add(merkleSphere);
      pulseGems.push(merkleSphere);
      // Orbital Ring
      const orbRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.04, 12, 32),
        M.copper
      );
      orbRing.position.set(0, 1.25, 0);
      group.add(orbRing);
      rotators.push(orbRing);
    } else if (def.id === 'market') {
      // 04 CALL MARKET: Deterministic Auction Hub + Opposing Rings
      box(group, 1.8, 0.5, 1.4, 0, 0.55, -0.05, S.body, 0.08);
      // Dual counter-rotating rings
      const rUpper = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.06, 12, 32),
        M.glowAmber
      );
      rUpper.rotation.x = Math.PI / 2;
      rUpper.position.set(0, 1.35, -0.05);
      group.add(rUpper);
      const rLower = new THREE.Mesh(
        new THREE.TorusGeometry(0.58, 0.06, 12, 32),
        M.glowCyan
      );
      rLower.rotation.x = Math.PI / 2;
      rLower.position.set(0, 0.85, -0.05);
      group.add(rLower);
      rotators.push(rUpper, rLower);
      // Trading terminal screen
      const mktCanvas = document.createElement('canvas');
      mktCanvas.width = 512;
      mktCanvas.height = 320;
      const kctx = mktCanvas.getContext('2d')!;
      kctx.fillStyle = '#140c1c';
      kctx.fillRect(0, 0, 512, 320);
      kctx.fillStyle = '#a855f7';
      kctx.font = 'bold 30px monospace';
      kctx.fillText('DISCRETE CALL AUCTION', 30, 50);
      kctx.fillStyle = '#ffffff';
      kctx.font = '22px monospace';
      kctx.fillText('CLEARING P*: ₹4.50/kWh', 30, 105);
      kctx.fillText('VOLUME: 2,000 Wh MATCHED', 30, 150);
      kctx.fillStyle = '#22c55e';
      kctx.fillText('OBLIGATIONS MINTED: 2', 30, 195);
      kctx.fillStyle = '#a1a1aa';
      kctx.font = '18px monospace';
      kctx.fillText('ALGORITHM: k=0.5 MIDPOINT', 30, 260);
      const mktTex = new THREE.CanvasTexture(mktCanvas);
      const mktScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.4, 0.85),
        new THREE.MeshBasicMaterial({ map: mktTex })
      );
      mktScreen.position.set(0, 1.1, 0.66);
      group.add(mktScreen);
    } else if (def.id === 'settlement') {
      // 05 SETTLEMENT: Dual Escrow Cylinders + Payout Statement
      box(group, 1.8, 0.5, 1.3, 0, 0.55, -0.05, S.body, 0.08);
      const escLeft = cyl(group, 0.38, 1.2, -0.45, 1.1, 0, M.chrome);
      const escRight = cyl(group, 0.38, 1.2, 0.45, 1.1, 0, M.chrome);
      rotators.push(escLeft, escRight);
      // Copper bridging pipe
      box(group, 1.1, 0.14, 0.22, 0, 1.2, 0, M.copper, 0.02);
      // Statement Screen
      const stCanvas = document.createElement('canvas');
      stCanvas.width = 440;
      stCanvas.height = 300;
      const sctx = stCanvas.getContext('2d')!;
      sctx.fillStyle = '#0a101a';
      sctx.fillRect(0, 0, 440, 300);
      sctx.fillStyle = '#3b82f6';
      sctx.font = 'bold 28px monospace';
      sctx.fillText('T+1 ESCROW STATEMENT', 25, 48);
      sctx.fillStyle = '#ffffff';
      sctx.font = '20px monospace';
      sctx.fillText('SELLER: +₹90.00 CREDITED', 25, 100);
      sctx.fillText('BUYER:  -₹90.00 SETTLED', 25, 140);
      sctx.fillStyle = '#10b981';
      sctx.fillText('STATUS: ATOMIC RECONCILED', 25, 190);
      const stTex = new THREE.CanvasTexture(stCanvas);
      const stScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 0.8),
        new THREE.MeshBasicMaterial({ map: stTex })
      );
      stScreen.position.set(0, 0.85, 0.62);
      group.add(stScreen);
    } else if (def.id === 'certificate') {
      // 06 CERTIFICATE: Floating Octahedral GAC Crystal Token
      box(group, 1.8, 0.5, 1.4, 0, 0.55, 0, S.body, 0.08);
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        M.glowGreen
      );
      gem.position.set(0, 1.3, 0);
      group.add(gem);
      pulseGems.push(gem);
      rotators.push(gem);
      // Provenance Ring
      const pRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.72, 0.035, 12, 32),
        M.chrome
      );
      pRing.position.set(0, 1.3, 0);
      group.add(pRing);
      rotators.push(pRing);
    }

    // Attach user data for raycasting
    group.traverse((o) => {
      o.userData.stationId = def.id;
    });

    stationObjects.push({
      def,
      group,
      basePos: new THREE.Vector3(...def.pos),
      glowMat,
      pickable: group,
      animatedProps: { rotators, pulseGems },
    });
  });

  // 7. Energy Flow & Busbars Network
  const flowNetwork = createEnergyFlowNetwork(ENERGY_STATIONS, {
    conduit: M.dark,
    copper: M.copper,
    glowGreen: M.glowGreen,
    glowAmber: M.glowAmber,
  });
  machine.add(flowNetwork.group);

  // 8. Interaction State & Camera Management
  let currentMode: MachineMode = 'SYSTEM';
  let currentCamera: CameraMode = 'OVERVIEW';
  let focusedStationId: EnergyStationId = 'generation';
  let isPlaying = true;
  let txProgress = 0;
  let hoveredStationId: EnergyStationId | null = null;

  const targetCameraPos = new THREE.Vector3(0, 6.5, 16);
  const targetCameraLookAt = new THREE.Vector3(0, 0.8, 0);

  function updateCameraGoal() {
    if (currentCamera === 'OVERVIEW') {
      targetCameraPos.set(0, 6.8, 16.5);
      targetCameraLookAt.set(0, 0.8, 0);
    } else if (currentCamera === 'SIDE') {
      targetCameraPos.set(15, 5.5, 10);
      targetCameraLookAt.set(0, 0.8, 0);
    } else if (currentCamera === 'TOP') {
      targetCameraPos.set(0.01, 18, 0.8);
      targetCameraLookAt.set(0, 0, 0);
    } else if (currentCamera === 'STATION') {
      const st = stationObjects.find((s) => s.def.id === focusedStationId);
      if (st) {
        targetCameraPos.copy(st.group.position).add(new THREE.Vector3(0, 2.5, 5.5));
        targetCameraLookAt.copy(st.group.position).add(new THREE.Vector3(0, 0.9, 0));
      }
    }
  }
  updateCameraGoal();
  camera.position.copy(targetCameraPos);
  controls.target.copy(targetCameraLookAt);

  // Raycasting for click/hover
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  const handlePointerMove = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(stationObjects.map((s) => s.group), true);

    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && !obj.userData.stationId && obj.parent) {
        obj = obj.parent;
      }
      const hitId = obj?.userData.stationId as EnergyStationId | undefined;
      if (hitId && hitId !== hoveredStationId) {
        hoveredStationId = hitId;
        container.style.cursor = 'pointer';
        callbacks.onStationHover?.(hitId);
      }
    } else if (hoveredStationId) {
      hoveredStationId = null;
      container.style.cursor = 'grab';
      callbacks.onStationHover?.(null);
    }
  };

  const handlePointerDown = () => {
    container.style.cursor = 'grabbing';
  };

  const handleClick = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(stationObjects.map((s) => s.group), true);

    if (intersects.length > 0) {
      let obj: THREE.Object3D | null = intersects[0].object;
      while (obj && !obj.userData.stationId && obj.parent) {
        obj = obj.parent;
      }
      const hitId = obj?.userData.stationId as EnergyStationId | undefined;
      if (hitId) {
        focusedStationId = hitId;
        callbacks.onStationClick?.(hitId);
        updateCameraGoal();
      }
    }
  };

  container.addEventListener('mousemove', handlePointerMove);
  container.addEventListener('mousedown', handlePointerDown);
  container.addEventListener('click', handleClick);
  cleanups.push(() => {
    container.removeEventListener('mousemove', handlePointerMove);
    container.removeEventListener('mousedown', handlePointerDown);
    container.removeEventListener('click', handleClick);
  });

  // 9. Main Animation Loop
  let rafId = 0;
  let lastTime = performance.now();
  let simTime = 0;
  let flightAngle = 0;

  const pinAnchor = new THREE.Vector3();

  const animate = () => {
    rafId = requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    if (isPlaying) {
      simTime += dt;
      flightAngle += dt * 0.15;
    }

    // Camera smoothing
    if (currentCamera === 'FLIGHT' && isPlaying) {
      const radius = 17;
      targetCameraPos.set(
        Math.cos(flightAngle) * radius,
        5.5 + Math.sin(flightAngle * 0.5) * 2.0,
        Math.sin(flightAngle) * radius
      );
      targetCameraLookAt.set(0, 0.8, 0);
    }

    camera.position.lerp(targetCameraPos, 0.05);
    controls.target.lerp(targetCameraLookAt, 0.05);
    controls.update();

    // Mode-specific layouts (ARCHITECTURE vs SYSTEM)
    const isArchitecture = currentMode === 'ARCHITECTURE';
    cutPlane.constant = THREE.MathUtils.lerp(cutPlane.constant, isArchitecture ? 1.05 : 15, 0.08);

    stationObjects.forEach((st, idx) => {
      // In Architecture mode, explode stations slightly
      const yOffset = isArchitecture ? (idx % 2 === 0 ? 0.6 : -0.3) : 0;
      st.group.position.y = THREE.MathUtils.lerp(st.group.position.y, st.basePos.y + yOffset, 0.08);

      // Rotations & live kinetics
      st.animatedProps.rotators?.forEach((rot, rIdx) => {
        rot.rotation.y += 0.02 * (rIdx % 2 === 0 ? 1 : -1);
      });
      st.animatedProps.pulseGems?.forEach((gem) => {
        gem.rotation.y += 0.03;
        gem.position.y += Math.sin(simTime * 3 + idx) * 0.001;
      });

      // Emissive highlight on hovered/focused station
      const isHighlighted = st.def.id === hoveredStationId || st.def.id === focusedStationId;
      st.glowMat.emissiveIntensity = THREE.MathUtils.lerp(
        st.glowMat.emissiveIntensity,
        isHighlighted ? 3.5 : 1.2,
        0.1
      );
    });

    // Update Energy Flow pulses & transaction packet
    flowNetwork.update(simTime, isPlaying, txProgress, currentMode);

    // Project station 3D coordinates to 2D screen pins
    if (callbacks.onProjectPins) {
      const width = getWidth();
      const height = getHeight();
      const projected = stationObjects.map((s) => {
        pinAnchor.copy(s.group.position).add(new THREE.Vector3(0, 2.2, 0)).project(camera);
        return {
          id: s.def.id,
          x: (pinAnchor.x * 0.5 + 0.5) * width,
          y: (-pinAnchor.y * 0.5 + 0.5) * height,
        };
      });
      callbacks.onProjectPins(projected);
    }

    renderer.render(scene, camera);
  };

  animate();
  callbacks.onReady?.();

  // Resize handler
  const handleResize = () => {
    const w = getWidth();
    const h = getHeight();
    if (w === 0 || h === 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  window.addEventListener('resize', handleResize);
  cleanups.push(() => window.removeEventListener('resize', handleResize));

  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      handleResize();
    });
    ro.observe(container);
    cleanups.push(() => ro.disconnect());
  }

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(rafId);
  };
  renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
  cleanups.push(() => renderer.domElement.removeEventListener('webglcontextlost', handleContextLost));

  return {
    setMode: (mode: MachineMode) => {
      currentMode = mode;
      if (mode === 'ARCHITECTURE') {
        currentCamera = 'SIDE';
      } else if (mode === 'STATIONS') {
        currentCamera = 'STATION';
      } else {
        currentCamera = 'OVERVIEW';
      }
      updateCameraGoal();
    },
    setCamera: (cam: CameraMode) => {
      currentCamera = cam;
      updateCameraGoal();
    },
    focusStation: (id: EnergyStationId) => {
      focusedStationId = id;
      currentCamera = 'STATION';
      updateCameraGoal();
    },
    play: () => {
      isPlaying = true;
    },
    pause: () => {
      isPlaying = false;
    },
    setProgress: (val: number) => {
      txProgress = val;
    },
    dispose: () => {
      cancelAnimationFrame(rafId);
      cleanups.forEach((c) => c());
      controls.dispose();
      flowNetwork.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
    },
  };
}
