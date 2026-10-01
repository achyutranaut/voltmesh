import * as THREE from 'three';
import { StationDefinition } from './EnergyEngineStation';

export interface EnergyFlowNetwork {
  group: THREE.Group;
  txPacket: THREE.Mesh;
  txGlow: THREE.PointLight;
  pulseMeshes: THREE.InstancedMesh;
  pulseCount: number;
  curve: THREE.CatmullRomCurve3;
  update: (time: number, isPlaying: boolean, progress: number, mode: string) => void;
  dispose: () => void;
}

export function createEnergyFlowNetwork(
  stations: StationDefinition[],
  materials: {
    conduit: THREE.Material;
    copper: THREE.Material;
    glowGreen: THREE.MeshStandardMaterial;
    glowAmber: THREE.MeshStandardMaterial;
  }
): EnergyFlowNetwork {
  const group = new THREE.Group();

  // 1. Build CatmullRom spline connecting the 6 stations sequentially
  const keyPoints: THREE.Vector3[] = stations.map((s) => {
    return new THREE.Vector3(s.pos[0], s.pos[1] + 0.6, s.pos[2]);
  });

  // Loop back around through low conduit return
  keyPoints.push(
    new THREE.Vector3(keyPoints[5].x + 0.8, 0.4, keyPoints[5].z - 0.5),
    new THREE.Vector3(0, 0.35, 2.5),
    new THREE.Vector3(-4.0, 0.35, 1.8),
    new THREE.Vector3(keyPoints[0].x - 0.8, 0.4, keyPoints[0].z)
  );

  const curve = new THREE.CatmullRomCurve3(keyPoints, true, 'centripetal', 0.2);

  // 2. Continuous primary transmission busbar tube
  const busbarGeo = new THREE.TubeGeometry(curve, 180, 0.05, 8, true);
  const busbarMesh = new THREE.Mesh(busbarGeo, materials.copper);
  busbarMesh.castShadow = true;
  group.add(busbarMesh);

  // Parallel secondary data conduit
  const offsetPoints = keyPoints.map((p) => p.clone().add(new THREE.Vector3(0, -0.15, 0.1)));
  const dataCurve = new THREE.CatmullRomCurve3(offsetPoints, true, 'centripetal', 0.2);
  const dataGeo = new THREE.TubeGeometry(dataCurve, 140, 0.028, 6, true);
  const dataMesh = new THREE.Mesh(dataGeo, materials.conduit);
  group.add(dataMesh);

  // 3. Instanced kinetic energy pulses moving along the power conduit
  const pulseCount = 72;
  const pulseGeo = new THREE.BoxGeometry(0.12, 0.04, 0.12);
  const pulseMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x10b981,
    emissiveIntensity: 2.0,
    metalness: 0.1,
    roughness: 0.2,
  });
  const pulseMeshes = new THREE.InstancedMesh(pulseGeo, pulseMat, pulseCount);
  pulseMeshes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(pulseMeshes);

  const dummy = new THREE.Object3D();
  const pVec = new THREE.Vector3();
  const tVec = new THREE.Vector3();

  // 4. Traceable single transaction packet (for ONE_TRANSACTION mode)
  const txPacket = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 18, 18),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x10b981,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    })
  );
  const txGlow = new THREE.PointLight(0x10b981, 4.0, 5, 2);
  txPacket.add(txGlow);
  group.add(txPacket);

  // Halo ring around tx packet
  const haloGeo = new THREE.RingGeometry(0.28, 0.32, 24);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x10b981,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.75,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = Math.PI / 2;
  txPacket.add(halo);

  const update = (time: number, isPlaying: boolean, progress: number, mode: string) => {
    // Animate instanced pulses along spline
    for (let i = 0; i < pulseCount; i++) {
      const u = (i / pulseCount + time * 0.04) % 1;
      curve.getPointAt(u, pVec);
      curve.getTangentAt(u, tVec);
      dummy.position.copy(pVec);
      dummy.rotation.set(0, -Math.atan2(tVec.z, tVec.x), 0);
      dummy.updateMatrix();
      pulseMeshes.setMatrixAt(i, dummy.matrix);
    }
    pulseMeshes.instanceMatrix.needsUpdate = true;

    // Single transaction particle
    if (mode === 'ONE_TRANSACTION') {
      txPacket.visible = true;
      // Map progress across the 6 stations
      const stationProg = Math.min(0.999, Math.max(0, progress));
      const u = (stationProg * 0.75); // active forward arc
      curve.getPointAt(u, pVec);
      txPacket.position.copy(pVec);
      halo.rotation.z = time * 3;

      // Color based on active station
      const stIdx = Math.min(5, Math.floor(progress * 6));
      const col = new THREE.Color(stations[stIdx].color);
      (txPacket.material as THREE.MeshStandardMaterial).emissive.copy(col);
      txGlow.color.copy(col);
      haloMat.color.copy(col);
    } else {
      txPacket.visible = false;
    }
  };

  const dispose = () => {
    busbarGeo.dispose();
    dataGeo.dispose();
    pulseGeo.dispose();
    pulseMat.dispose();
    haloGeo.dispose();
    haloMat.dispose();
  };

  return {
    group,
    txPacket,
    txGlow,
    pulseMeshes,
    pulseCount,
    curve,
    update,
    dispose,
  };
}
