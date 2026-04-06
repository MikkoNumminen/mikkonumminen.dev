import * as THREE from 'three';
import { gsap } from 'gsap';
import { projects, type Project } from '../../data/projects';

export interface ProjectsSceneOptions {
  canvas: HTMLCanvasElement;
  hoverLabel: HTMLElement;
  onSelect: (project: Project) => void;
  onDeselect: () => void;
  reducedMotion?: boolean;
}

export interface ProjectsSceneHandle {
  selectById: (id: string | null) => void;
  resize: () => void;
  dispose: () => void;
}

interface PlanetEntry {
  project: Project;
  group: THREE.Group;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  orbitLine: THREE.Line;
}

const SOLAR_CAMERA_POS = new THREE.Vector3(0, 8, 28);
const SOLAR_LOOK_AT = new THREE.Vector3(0, 0, 0);

export function createProjectsScene(
  opts: ProjectsSceneOptions,
): ProjectsSceneHandle {
  const { canvas, hoverLabel, onSelect, onDeselect, reducedMotion = false } =
    opts;

  // ── Renderer ────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  // ── Scene + camera ──────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x020512, 0.012);

  const camera = new THREE.PerspectiveCamera(
    52,
    window.innerWidth / window.innerHeight,
    0.1,
    500,
  );
  camera.position.copy(SOLAR_CAMERA_POS);
  const lookAtTarget = SOLAR_LOOK_AT.clone();
  camera.lookAt(lookAtTarget);

  // ── Starfield ───────────────────────────────────────────────────────
  const starCount = 1800;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starColorOptions = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xc8d8ff),
    new THREE.Color(0xfff0c8),
  ];
  for (let i = 0; i < starCount; i++) {
    const i3 = i * 3;
    // Distribute on a large sphere (random direction × random distance)
    const r = 60 + Math.random() * 140;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPositions[i3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPositions[i3 + 2] = r * Math.cos(phi);
    const c = starColorOptions[Math.floor(Math.random() * starColorOptions.length)]!;
    starColors[i3] = c.r;
    starColors[i3 + 1] = c.g;
    starColors[i3 + 2] = c.b;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  const starMaterial = new THREE.PointsMaterial({
    size: 0.18,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });
  const starfield = new THREE.Points(starGeometry, starMaterial);
  scene.add(starfield);

  // ── Sun ─────────────────────────────────────────────────────────────
  const sunGroup = new THREE.Group();
  scene.add(sunGroup);

  const sunCoreMaterial = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const sunCore = new THREE.Mesh(new THREE.SphereGeometry(1.6, 48, 48), sunCoreMaterial);
  sunGroup.add(sunCore);

  const sunGlowMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      glowColor: { value: new THREE.Color(0xffc865) },
      intensity: { value: 1.4 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vPositionNormal;
      void main() {
        float a = pow(0.7 - dot(vNormal, vPositionNormal), 3.0);
        gl_FragColor = vec4(glowColor, a * intensity);
      }
    `,
  });
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(2.6, 48, 48), sunGlowMaterial);
  sunGroup.add(sunGlow);

  // Sun light
  const sunLight = new THREE.PointLight(0xffd6a0, 3.2, 180, 1.4);
  sunLight.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x404060, 0.55));

  // ── Planets ─────────────────────────────────────────────────────────
  const planets: PlanetEntry[] = projects.map((project) => {
    const group = new THREE.Group();
    group.rotation.x = project.tilt;
    scene.add(group);

    const baseRadius = 0.55;
    const radius = baseRadius * project.scale;
    const geometry = new THREE.SphereGeometry(radius, 36, 36);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(project.color),
      roughness: 0.55,
      metalness: 0.1,
      emissive: new THREE.Color(project.color).multiplyScalar(0.08),
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.projectId = project.id;

    // Soft glow halo (sprite-style billboard)
    const glowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      uniforms: {
        glowColor: { value: new THREE.Color(project.color) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPositionNormal = normalize((modelViewMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vPositionNormal;
        void main() {
          float a = pow(0.65 - dot(vNormal, vPositionNormal), 3.0);
          gl_FragColor = vec4(glowColor, a * 0.9);
        }
      `,
    });
    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.55, 24, 24),
      glowMaterial,
    );
    glow.userData.projectId = project.id;

    const planetWrap = new THREE.Group();
    planetWrap.add(mesh);
    planetWrap.add(glow);
    planetWrap.position.set(
      Math.cos(project.phase) * project.orbitRadius,
      0,
      Math.sin(project.phase) * project.orbitRadius,
    );

    if (project.hasRing) {
      const ringGeometry = new THREE.RingGeometry(radius * 1.35, radius * 2, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: new THREE.Color(project.ringColor ?? project.color),
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = Math.PI / 2 - 0.4;
      planetWrap.add(ring);
    }

    group.add(planetWrap);

    // Orbit ring
    const orbitSegments = 128;
    const orbitGeometry = new THREE.BufferGeometry();
    const orbitPositions = new Float32Array((orbitSegments + 1) * 3);
    for (let i = 0; i <= orbitSegments; i++) {
      const a = (i / orbitSegments) * Math.PI * 2;
      orbitPositions[i * 3] = Math.cos(a) * project.orbitRadius;
      orbitPositions[i * 3 + 1] = 0;
      orbitPositions[i * 3 + 2] = Math.sin(a) * project.orbitRadius;
    }
    orbitGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(orbitPositions, 3),
    );
    const orbitMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(project.color),
      transparent: true,
      opacity: 0.18,
    });
    const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
    group.add(orbitLine);

    return { project, group: planetWrap, mesh, glow, orbitLine };
  });

  // ── Raycasting ──────────────────────────────────────────────────────
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(-1, -1);
  let hovered: PlanetEntry | null = null;
  let selected: PlanetEntry | null = null;

  const onPointerMove = (e: PointerEvent) => {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
  };
  const onPointerLeave = () => {
    pointer.set(-2, -2);
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerleave', onPointerLeave);

  const onClick = (e: MouseEvent) => {
    if (selected) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes = planets.map((p) => p.mesh);
    const hits = raycaster.intersectObjects(meshes);
    if (hits.length > 0) {
      const id = hits[0]!.object.userData.projectId as string;
      const entry = planets.find((p) => p.project.id === id) ?? null;
      if (entry) {
        selectPlanet(entry);
      }
    }
  };
  canvas.addEventListener('click', onClick);

  // ── Camera tween state ──────────────────────────────────────────────
  const cameraTarget = SOLAR_CAMERA_POS.clone();
  const lookAtCurrent = lookAtTarget.clone();

  function selectPlanet(entry: PlanetEntry) {
    selected = entry;
    onSelect(entry.project);
    // Camera transition is driven by the tick loop, which lerps toward
    // `cameraTarget` (recomputed every frame from the planet's world pos
    // while `selected` is set) so the camera tracks moving planets.
  }

  function deselect() {
    selected = null;
    onDeselect();
  }

  // ── Resize ──────────────────────────────────────────────────────────
  const onResize = () => {
    if (disposed) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  // ── Animation loop ──────────────────────────────────────────────────
  const startTime = performance.now();
  let lastFrame = startTime;
  let raf = 0;
  let disposed = false;

  const tmpVec = new THREE.Vector3();
  const tmpVec2 = new THREE.Vector3();

  const tick = () => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);

    const now = performance.now();
    const t = (now - startTime) / 1000;
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;

    // Sun spin
    sunCore.rotation.y = t * 0.2;
    sunGlowMaterial.uniforms.intensity!.value = 1.3 + Math.sin(t * 1.8) * 0.12;

    // Planets orbit
    const baseOrbitScale = reducedMotion ? 0.25 : 1.0;
    const orbitSpeedScale = (selected ? 0.18 : 1.0) * baseOrbitScale;
    planets.forEach((entry) => {
      const angle = entry.project.phase + t * entry.project.orbitSpeed * orbitSpeedScale;
      entry.group.position.set(
        Math.cos(angle) * entry.project.orbitRadius,
        0,
        Math.sin(angle) * entry.project.orbitRadius,
      );
      entry.mesh.rotation.y += dt * 0.4;
    });

    // Raycast hover (skip while a planet is selected)
    if (!selected) {
      raycaster.setFromCamera(pointer, camera);
      const meshes = planets.map((p) => p.mesh);
      const hits = raycaster.intersectObjects(meshes);
      const newHovered = hits.length > 0
        ? planets.find((p) => p.project.id === hits[0]!.object.userData.projectId) ?? null
        : null;

      if (newHovered !== hovered) {
        if (hovered) {
          gsap.to(hovered.mesh.scale, { x: 1, y: 1, z: 1, duration: 0.35, ease: 'power2.out' });
        }
        if (newHovered) {
          gsap.to(newHovered.mesh.scale, { x: 1.18, y: 1.18, z: 1.18, duration: 0.35, ease: 'power2.out' });
          canvas.style.cursor = 'pointer';
          updateHoverLabel(newHovered);
        } else {
          canvas.style.cursor = '';
          hideHoverLabel();
        }
        hovered = newHovered;
      } else if (hovered) {
        positionHoverLabel();
      }
    } else {
      hideHoverLabel();
    }

    // Camera target
    if (selected) {
      // Position camera at an offset relative to the planet's WORLD position.
      // Offset puts the planet on the LEFT third of the screen so the detail
      // panel can occupy the right side.
      const planetWorld = selected.group.getWorldPosition(tmpVec);
      const offsetX = 2.0;
      const offsetY = 1.4;
      const offsetZ = 4.5 + selected.project.scale * 1.5;

      cameraTarget.set(
        planetWorld.x + offsetX,
        planetWorld.y + offsetY,
        planetWorld.z + offsetZ,
      );
      lookAtCurrent.lerp(planetWorld, 0.08);
    } else {
      cameraTarget.copy(SOLAR_CAMERA_POS);
      lookAtCurrent.lerp(SOLAR_LOOK_AT, 0.08);
    }

    // Smooth camera move
    camera.position.lerp(cameraTarget, selected ? 0.06 : 0.045);
    camera.lookAt(lookAtCurrent);

    // Starfield slow drift (parallax)
    starfield.rotation.y = t * 0.005;

    renderer.render(scene, camera);
  };

  function updateHoverLabel(entry: PlanetEntry) {
    hoverLabel.innerHTML = `
      <span class="hover-label__name">${escapeHtml(entry.project.name)}</span>
      <span class="hover-label__tag">${escapeHtml(entry.project.tagline)}</span>
      <span class="hover-label__tech">${entry.project.tech.slice(0, 4).map(escapeHtml).join(' · ')}</span>
    `;
    hoverLabel.dataset.visible = 'true';
    positionHoverLabel();
  }

  function positionHoverLabel() {
    if (!hovered) return;
    hovered.group.getWorldPosition(tmpVec2);
    tmpVec2.project(camera);
    const x = (tmpVec2.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-tmpVec2.y * 0.5 + 0.5) * window.innerHeight;
    hoverLabel.style.transform = `translate(${x + 24}px, ${y - 12}px)`;
  }

  function hideHoverLabel() {
    hoverLabel.dataset.visible = 'false';
  }

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  }

  tick();

  return {
    selectById: (id) => {
      if (id === null) {
        if (selected) deselect();
        return;
      }
      const entry = planets.find((p) => p.project.id === id);
      if (entry && entry !== selected) selectPlanet(entry);
    },
    resize: onResize,
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('click', onClick);
      planets.forEach((p) => {
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        p.glow.geometry.dispose();
        (p.glow.material as THREE.Material).dispose();
        p.orbitLine.geometry.dispose();
        (p.orbitLine.material as THREE.Material).dispose();
      });
      sunCore.geometry.dispose();
      sunCoreMaterial.dispose();
      sunGlow.geometry.dispose();
      sunGlowMaterial.dispose();
      starGeometry.dispose();
      starMaterial.dispose();
      renderer.dispose();
    },
  };
}
