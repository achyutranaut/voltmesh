'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

/**
 * Agentic Factory — Interactive 3D Machine
 *
 * A short-video factory that AI agents build, as one machine you can spin:
 * order → script → video → post → payment across five stations on a metal plate.
 * Four modes (Assembled, Cutaway, Stations, One order), five cameras, hover and
 * click stations. Procedural three.js: no models, no images.
 *
 * Reference technical implementation provided for integration.
 */

export type AgenticFactory3DProps = {
  /** Height of the scene box, e.g. 720 or '100vh'. Default '100vh'. */
  height?: number | string
  className?: string
  /** Clean hero mode: no panels, the machine on the right of a wide frame. */
  embed?: boolean
  /** A station was clicked: 'engine' | 'admin' | 'storefront' | 'cabinet' | 'cashdesk'. */
  onStation?: (id: StationId) => void
  /** The first real frame is drawn. */
  onReady?: () => void
}

export default function AgenticFactory3D({
  height = '100vh',
  className,
  embed = false,
  onStation,
  onReady,
}: AgenticFactory3DProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const handlers = useRef({ onStation, onReady })
  useEffect(() => {
    handlers.current = { onStation, onReady }
  }, [onStation, onReady])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    let dispose: (() => void) | undefined
    let cancelled = false
    document.fonts.ready.then(() => {
      if (cancelled) return
      dispose = initMachineScene(root, getComputedStyle(root).fontFamily, {
        embedded: embed,
        onStation: (id) => handlers.current.onStation?.(id),
        onReady: () => handlers.current.onReady?.(),
      })
    })
    return () => {
      cancelled = true
      dispose?.()
    }
  }, [embed])

  return (
    <div
      ref={rootRef}
      className={['agentic-factory-3d', embed && 'embed', className].filter(Boolean).join(' ')}
      style={{ height }}
    >
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div
        id="scene"
        role="img"
        aria-label="Interactive 3D machine with five stations: Engine, Admin, Storefront, Cabinet and Checkout. Drag to rotate, scroll or pinch to zoom. Hover or tap a station to take a closer look."
      />
      <div className="vignette" />
      <header className="topbar debug-ui">
        <div className="identity">
          <div className="mark">
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none">
              <path
                d="M3 5l7 11 7-11M7 5l3 5 3-5"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div>
            <strong>Agentic Factory</strong>
            <small>Interactive workshop</small>
          </div>
        </div>
        <div className="status" id="status">
          <i />
          <span id="status-text">Machine running</span>
          <span>SERIES 001</span>
        </div>
      </header>
      <div className="scene-heading debug-ui">
        The machine you will build <span className="index">5 MODULES / 1 SYSTEM</span>
      </div>
      <div className="coordinates debug-ui">PROTOTYPE 01 — FROM IDEA TO PAYMENT</div>
      <div id="journey" className="debug-ui">
        <div className="journey-icon">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M3 4h10v9H3zM6 4V2h4v2m-5 4h6" stroke="currentColor" strokeLinejoin="round" />
          </svg>
        </div>
        <div>
          <strong id="journey-title">New order</strong>
          <small id="journey-detail">Cabinet · an order from Anna</small>
        </div>
        <div className="track">
          <i id="journey-progress" />
        </div>
      </div>
      <div id="labels" />
      <div id="tooltip" role="tooltip">
        <strong />
        <p />
      </div>
      <div className="controls debug-ui">
        <nav className="mode-bar" aria-label="Machine mode">
          <button data-mode="assembled" aria-pressed="true">
            Assembled
          </button>
          <button data-mode="cutaway" aria-pressed="false">
            Cutaway
          </button>
          <button data-mode="stations" aria-pressed="false">
            Stations
          </button>
          <button data-mode="order" aria-pressed="false">
            One order
          </button>
        </nav>
        <nav className="camera-row" aria-label="Camera">
          <span className="caption">VIEW</span>
          <button data-camera="overview" aria-pressed="true">
            Overview
          </button>
          <button data-camera="side" aria-pressed="false">
            Side
          </button>
          <button data-camera="top" aria-pressed="false">
            Top
          </button>
          <button data-camera="station" aria-pressed="false">
            Station
          </button>
          <button data-camera="flight" aria-pressed="false">
            Flight
          </button>
          <span className="divider" />
          <button id="play" aria-label="Pause the animation" aria-pressed="false">
            ⏸
          </button>
        </nav>
      </div>
      <div id="loading">
        <i />
        <span>Assembling machine</span>
      </div>
      <div id="error" role="alert">
        <strong>Could not start 3D scene</strong>
        <p>Check that WebGL is turned on in your browser.</p>
      </div>
    </div>
  )
}

export type MachineMode = 'assembled' | 'cutaway' | 'stations' | 'order'
export type MachineCamera = 'overview' | 'side' | 'top' | 'station' | 'flight'
export type StationId = 'engine' | 'admin' | 'storefront' | 'cabinet' | 'cashdesk'

export type MachineApi = {
  setMode: (name: string) => boolean
  focusStation: (id: string) => boolean
  setCamera: (name: string) => boolean
  play: () => boolean
  pause: () => boolean
}

export type MachineSceneOptions = {
  embedded: boolean
  onStation?: (id: StationId) => void
  onReady?: () => void
}

function initMachineScene(
  root: HTMLElement,
  _fontFamily: string,
  options: MachineSceneOptions
): () => void {
  const cleanups: Array<() => void> = []
  const frameWidth = () => root.clientWidth || 800
  const frameHeight = () => root.clientHeight || 600

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(33, frameWidth() / frameHeight(), 0.1, 150)
  camera.position.set(10.5, 10.8, 17)

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  } catch (e) {
    return () => {}
  }

  renderer.setSize(frameWidth(), frameHeight())
  const sceneEl = root.querySelector('#scene')
  if (sceneEl) sceneEl.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true

  const key = new THREE.DirectionalLight(0xfff1d8, 4.2)
  key.position.set(-4, 12, 7)
  scene.add(key)
  scene.add(new THREE.HemisphereLight(0xdbe5f4, 0x29211a, 2))

  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(12.8, 0.38, 8.25),
    new THREE.MeshStandardMaterial({ color: 0x292f37, metalness: 0.8, roughness: 0.3 })
  )
  scene.add(plate)

  let rafId = 0
  const animate = () => {
    rafId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }
  animate()
  options.onReady?.()

  return () => {
    cancelAnimationFrame(rafId)
    controls.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement) {
      renderer.domElement.parentElement.removeChild(renderer.domElement)
    }
  }
}

const STYLES = `
.agentic-factory-3d {
  width: 100%;
  position: relative;
  overflow: hidden;
  background: #000;
  color: #fff;
  contain: layout;
}
.agentic-factory-3d #scene {
  position: absolute;
  inset: 0;
}
.agentic-factory-3d .controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 10;
}
.agentic-factory-3d .mode-bar {
  display: flex;
  gap: 4px;
  background: rgba(20, 20, 25, 0.85);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.1);
}
.agentic-factory-3d .mode-bar button {
  background: transparent;
  color: #aaa;
  border: none;
  padding: 6px 12px;
  font-size: 11px;
  cursor: pointer;
  border-radius: 4px;
}
.agentic-factory-3d .mode-bar button[aria-pressed='true'] {
  background: #ff7a1a;
  color: #000;
  font-weight: 600;
}
.agentic-factory-3d .camera-row {
  display: flex;
  justify-content: center;
  gap: 6px;
  font-size: 10px;
  color: #888;
}
.agentic-factory-3d .camera-row button {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
}
.agentic-factory-3d #loading, .agentic-factory-3d #error {
  display: none;
}
`
