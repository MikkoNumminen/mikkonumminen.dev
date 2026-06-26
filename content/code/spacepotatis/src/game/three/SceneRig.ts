import * as THREE from "three";
import type { MissionDefinition, MissionId } from "@/types";
import type { CelestialBody } from "./CelestialBody";
import { Planet } from "./Planet";
import { Station } from "./Station";
import { Starfield } from "./Starfield";
import { Sun } from "./Sun";

// Captures the ~80% of construction that GalaxyScene and LandingScene shared
// verbatim: WebGLRenderer config, Scene + fog, Starfield, Sun, ambient + rim
// light, and the planet add-loop. Drift between the two scenes here used to
// produce visible flashes on the galaxy↔landing transition; centralizing the
// scaffold removes the only place that drift could come from.
//
// Why a factory and not a base class: GalaxyScene and LandingScene already
// keep camera/controls in their own classes (CameraController vs. an inline
// PerspectiveCamera with auto-orbit). A base class would need protected
// fields that fight the readonly-everywhere style we hold elsewhere.

const CLEAR_COLOR = 0x05060f;
const FOG_DENSITY = 0.008;
const AMBIENT_COLOR = 0x1a2440;
const AMBIENT_INTENSITY = 0.07;
const RIM_COLOR = 0x3a5b8c;
const RIM_INTENSITY = 0.10;
const RIM_POSITION: readonly [number, number, number] = [-10, -2, -8];

export interface SceneRigOpts {
  readonly dpr: number;
  readonly powerPreference: "high-performance" | "low-power";
  readonly sunColor: string;
  readonly sunSize: number;
  readonly planets: readonly MissionDefinition[];
}

export interface SceneRig {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly starfield: Starfield;
  readonly sun: Sun;
  // The array holds Planet AND Station instances; both implement
  // CelestialBody. Stations render every kind: "shop" body, planets render
  // everything else.
  readonly planets: readonly CelestialBody[];
  // id → body lookup so child-orbit bodies (orbitParentId) can read their
  // parent's current world position each frame.
  readonly planetsById: ReadonlyMap<MissionId, CelestialBody>;
  readonly ambient: THREE.AmbientLight;
  readonly rimLight: THREE.DirectionalLight;
  dispose(): void;
}

export function createSceneRig(canvas: HTMLCanvasElement, opts: SceneRigOpts): SceneRig {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: opts.powerPreference
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.dpr));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.setClearColor(CLEAR_COLOR, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(CLEAR_COLOR, FOG_DENSITY);

  const starfield = new Starfield();
  scene.add(starfield.object);

  const sun = new Sun({ coreColor: opts.sunColor, sizeScale: opts.sunSize });
  scene.add(sun.object);

  const ambient = new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_INTENSITY);
  const rimLight = new THREE.DirectionalLight(RIM_COLOR, RIM_INTENSITY);
  rimLight.position.set(RIM_POSITION[0], RIM_POSITION[1], RIM_POSITION[2]);
  scene.add(ambient, rimLight);

  const planets: CelestialBody[] = [];
  const planetsById = new Map<MissionId, CelestialBody>();
  for (const def of opts.planets) {
    // Markets are mechanical structures, not worlds — render them as
    // Stations. Everything else (combat planets, scenery planets) is a Planet.
    const body: CelestialBody = def.kind === "shop" ? new Station(def) : new Planet(def);
    planets.push(body);
    planetsById.set(def.id, body);
    scene.add(body.object);
  }

  return {
    renderer,
    scene,
    starfield,
    sun,
    planets,
    planetsById,
    ambient,
    rimLight,
    dispose(): void {
      starfield.dispose();
      sun.dispose();
      for (const body of planets) body.dispose();
      scene.remove(ambient);
      scene.remove(rimLight);
      ambient.dispose();
      // DirectionalLight owns a shadow camera; dispose its shadow map
      // defensively. Will only matter when shadows are enabled.
      rimLight.shadow?.map?.dispose();
      rimLight.dispose();
      // forceContextLoss() before dispose() is the canonical WebGL teardown
      // pair — without it the context lingers until GC on rapid galaxy↔combat
      // cycling and can exhaust the browser's per-page WebGL context budget.
      //
      // INVARIANT (paired with GameCanvas.tsx galaxy <canvas key=...>):
      // forceContextLoss() makes the canvas's context permanently
      // unrecoverable. That's safe only when the canvas DOM element is
      // ALSO going away (galaxy→combat unmount, page nav). On a warp the
      // canvas would otherwise be reused, so GameCanvas keys it on
      // currentSolarSystemId to force a fresh DOM element per system.
      // Dropping the key prop without removing this forceContextLoss call
      // will break warp deterministically.
      renderer.forceContextLoss();
      renderer.dispose();
    }
  };
}
