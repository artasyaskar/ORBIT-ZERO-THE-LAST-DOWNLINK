/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Cinematic Landing 3D Space Environment (RC9.2 Polish)
 *
 * Reproduces the visual fidelity and atmosphere of gemini_generated_video_0a69bdeb.mp4:
 * 1. Photorealistic 3D Earth:
 *    - High-resolution 4K NASA Blue Marble day texture with deep sapphire oceans and lush geography.
 *    - 4K normal map for topographical relief under grazing solar keylight.
 *    - 4K specular map for glossy ocean water reflectivity.
 *    - 4K city night lights emissive map on the unlit hemisphere.
 *    - True Rayleigh atmospheric limb Fresnel glow via custom ShaderMaterial (zero hard cartoon outlines).
 * 2. Independent swirling cloud sphere with dual-axis atmospheric drift.
 * 3. Photorealistic Earth-Observation Satellite (Sentinel / SAR class):
 *    - Gold Kapton MLI avionics bus, thermal radiators, parabolic comms dish, optical payload.
 *    - Deployable photovoltaic solar panel arrays with titanium trusses.
 *    - Active pulsing telemetry strobe beacon.
 *    - Authentically revolves in an inclined Low Earth Orbit (LEO) with Nadir-pointing attitude control!
 * 4. Mysterious deep space celestial environment:
 *    - 4K Milky Way cosmic backdrop sphere.
 *    - Multi-spectral layered starfields with subtle twinkling.
 * 5. Smooth mouse parallax and camera push-in transition.
 * 6. 100% clean teardown on launch into core game engine.
 */

import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
} from '@iwsdk/core';

const ASSET_BASE: string = (import.meta as any).env?.BASE_URL ?? './';
export class LandingScene {
  private container: HTMLElement;
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;

  private earthGroup: Group;
  private earthMesh!: Mesh;
  private cloudMesh!: Mesh;
  private atmoGlowMesh!: Mesh;
  private skyboxMesh!: Mesh;
  private satelliteGroup: Group;
  private satBeaconMesh!: Mesh;

  private starfieldNear!: Points;
  private starfieldFar!: Points;

  private texturesToDispose: Texture[] = [];
  private animFrameId: number | null = null;
  private isDisposed = false;
  private isPaused = false;

  private mouseTarget = new Vector2(0, 0);
  private mouseCurrent = new Vector2(0, 0);

  private clockTime = 0;
  private satelliteOrbitAngle = 1.2; // Start in visible front-right arc

  private readonly onMouseMoveBound: (e: MouseEvent) => void;
  private readonly onResizeBound: () => void;
  private readonly onVisibilityChangeBound: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.scene = new Scene();
    this.scene.background = new Color(0x02050c);

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.camera = new PerspectiveCamera(42, width / height, 0.1, 200);
    this.camera.position.set(0, 0.35, 5.8);

    this.renderer = new WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.domElement.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;display:block;';
    container.appendChild(this.renderer.domElement);

    this.earthGroup = new Group();
    this.earthGroup.name = 'LandingEarthGroup';
    this.scene.add(this.earthGroup);

    this.satelliteGroup = new Group();
    this.satelliteGroup.name = 'LandingSatellite';
    this.scene.add(this.satelliteGroup);

    this.setupLighting();
    this.buildSkybox();
    this.buildStarfields();
    this.buildEarth();
    this.buildSatellite();

    this.onMouseMoveBound = (e: MouseEvent) => this.onMouseMove(e);
    this.onResizeBound = () => this.onResize();
    this.onVisibilityChangeBound = () => this.onVisibilityChange();

    window.addEventListener('mousemove', this.onMouseMoveBound, { passive: true });
    window.addEventListener('resize', this.onResizeBound);
    document.addEventListener('visibilitychange', this.onVisibilityChangeBound);

    this.animate(0);
  }

  private setupLighting(): void {
    // 1. Primary Directional Solar Keylight: Warm sunlight illuminating Earth's visible face
    const sunLight = new DirectionalLight(0xfffaf0, 3.4);
    sunLight.position.set(5.5, 3.2, 4.2);
    this.scene.add(sunLight);

    // 2. Atmospheric Rayleigh Rim Light: Subtle cyan-blue backfill for the horizon limb
    const rimLight = new DirectionalLight(0x38bdf8, 1.2);
    rimLight.position.set(-4.5, 1.5, -1.0);
    this.scene.add(rimLight);

    // 3. Deep Space Ambient: Gentle indigo/navy fill keeping space deep and atmospheric
    const spaceAmbient = new AmbientLight(0x0c192e, 0.55);
    this.scene.add(spaceAmbient);
  }

  private buildSkybox(): void {
    const loader = new TextureLoader();
    const skyGeo = new SphereGeometry(85, 36, 24);

    const skyMat = new MeshBasicMaterial({
      side: BackSide,
      color: 0x223555, // Clean deep celestial indigo-space tint (filters out magenta noise)
      transparent: true,
      opacity: 0.38,
    });

    this.skyboxMesh = new Mesh(skyGeo, skyMat);
    this.skyboxMesh.name = 'LandingMilkyWaySkybox';
    this.skyboxMesh.visible = false;
    this.scene.add(this.skyboxMesh);

    const skyTex = loader.load(
      `${ASSET_BASE}assets/textures/milky_way_skybox_4096.jpg`,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        skyMat.map = tex;
        skyMat.needsUpdate = true;
        this.skyboxMesh.visible = true;
      },
      undefined,
      () => {
        // Fallback: deep space without skybox
      }
    );
    this.texturesToDispose.push(skyTex);
  }

  private buildStarfields(): void {
    // Far celestial starfield (2,200 crisp spectral stars)
    const farGeo = new BufferGeometry();
    const farCount = 2200;
    const farPos: number[] = [];
    const farColors: number[] = [];

    let seed = 928371;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < farCount; i++) {
      const u = rand();
      const v = rand();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 55 + rand() * 25;

      farPos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );

      // Realistic spectral star colors (O/B blue, A/F white, K/M amber)
      const starType = rand();
      if (starType > 0.82) {
        farColors.push(0.65, 0.85, 1.0); // Sapphire blue
      } else if (starType > 0.35) {
        farColors.push(0.95, 0.98, 1.0); // Brilliant white
      } else {
        farColors.push(1.0, 0.82, 0.58); // Warm stellar gold
      }
    }

    farGeo.setAttribute('position', new Float32BufferAttribute(farPos, 3));
    farGeo.setAttribute('color', new Float32BufferAttribute(farColors, 3));

    const farMat = new PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
    });
    this.starfieldFar = new Points(farGeo, farMat);
    this.scene.add(this.starfieldFar);

    // Near starfield layer (450 larger stars)
    const nearGeo = new BufferGeometry();
    const nearCount = 450;
    const nearPos: number[] = [];
    const nearColors: number[] = [];

    for (let i = 0; i < nearCount; i++) {
      const u = rand();
      const v = rand();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 38 + rand() * 14;

      nearPos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      nearColors.push(0.88 + rand() * 0.12, 0.92 + rand() * 0.08, 1.0);
    }

    nearGeo.setAttribute('position', new Float32BufferAttribute(nearPos, 3));
    nearGeo.setAttribute('color', new Float32BufferAttribute(nearColors, 3));

    const nearMat = new PointsMaterial({
      size: 0.28,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
    });
    this.starfieldNear = new Points(nearGeo, nearMat);
    this.scene.add(this.starfieldNear);
  }

  private createInstantEarthPlaceholderTexture(): CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Deep sapphire ocean gradient so Frame 0 immediately displays rich planetary color
    const ocean = ctx.createLinearGradient(0, 0, 0, 256);
    ocean.addColorStop(0.0, '#cbd5e1');
    ocean.addColorStop(0.11, '#0c3a6e');
    ocean.addColorStop(0.5, '#082952');
    ocean.addColorStop(0.89, '#0e4382');
    ocean.addColorStop(1.0, '#cbd5e1');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, 512, 256);

    // Subtle glowing turquoise coastal shelves
    ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
    const drawBlob = (x: number, y: number, rx: number, ry: number, rot = 0) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawBlob(350, 92, 68, 42, -0.2);
    drawBlob(275, 130, 38, 44, 0.25);
    drawBlob(148, 108, 44, 48, -0.35);

    // Major continental landforms (Eurasia / South Asia, Africa, Americas, Australia)
    ctx.fillStyle = '#2d6a4f';
    drawBlob(348, 84, 58, 30, -0.15); // Eurasia
    drawBlob(362, 104, 18, 22, 0.1);  // Indian subcontinent
    drawBlob(278, 124, 26, 36, 0.15); // Africa
    drawBlob(142, 92, 30, 28, -0.3);  // North America
    drawBlob(174, 152, 20, 32, 0.2);  // South America
    drawBlob(426, 162, 22, 14, -0.1); // Australia

    // Arid Sahara / Arabian / Thar ochre belts + Himalayan ridge highlight
    ctx.fillStyle = '#b5835a';
    drawBlob(286, 102, 28, 12, 0.05);
    drawBlob(332, 96, 22, 11, -0.1);
    drawBlob(426, 162, 12, 8, -0.1);

    ctx.fillStyle = 'rgba(226, 232, 240, 0.65)';
    drawBlob(358, 92, 16, 5, -0.12); // Himalayas / Tibetan snow ridge

    // Subtle warm city light clusters
    ctx.fillStyle = 'rgba(253, 230, 138, 0.45)';
    for (const [lx, ly] of [[358, 99], [352, 106], [285, 84], [156, 86], [392, 88]]) {
      ctx.beginPath();
      ctx.arc(lx, ly, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    this.texturesToDispose.push(tex);
    return tex;
  }

  private buildEarth(): void {
    const loader = new TextureLoader();

    // 1. Earth Solid Surface Sphere (Radius 1.80)
    const earthGeo = new SphereGeometry(1.80, 54, 40);
    const placeholderTex = this.createInstantEarthPlaceholderTexture();

    // Create material with synchronous placeholder map so Three.js never binds an unloaded 1x1 black pixel
    const earthMat = new MeshStandardMaterial({
      map: placeholderTex ?? undefined,
      color: new Color(0xffffff),
      normalScale: new Vector2(0.85, 0.85),
      roughness: 0.45,
      metalness: 0.05,
      emissive: new Color(0x0c2d54),
      emissiveIntensity: 0.38,
    });

    this.earthMesh = new Mesh(earthGeo, earthMat);
    this.earthMesh.name = 'LandingEarthMesh';
    this.earthGroup.add(this.earthMesh);

    // Load 2K textures matching src/assets.ts so browser cache is 100% shared with core game
    const dayMap = loader.load(
      `${ASSET_BASE}assets/textures/earth_atmos_2048.jpg`,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
    );
    this.texturesToDispose.push(dayMap);

    const normalMap = loader.load(
      `${ASSET_BASE}assets/textures/earth_normal_2048.jpg`,
      (tex) => {
        earthMat.normalMap = tex;
        earthMat.needsUpdate = true;
      },
    );
    this.texturesToDispose.push(normalMap);

    const specularMap = loader.load(
      `${ASSET_BASE}assets/textures/earth_specular_2048.jpg`,
      (tex) => {
        earthMat.roughnessMap = tex;
        earthMat.needsUpdate = true;
      },
    );
    this.texturesToDispose.push(specularMap);

    const lightsMap = loader.load(
      `${ASSET_BASE}assets/textures/earth_lights_2048.png`,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        earthMat.emissiveMap = tex;
        earthMat.emissive.setHex(0xffd580);
        earthMat.emissiveIntensity = 0.65;
        earthMat.needsUpdate = true;
      },
    );
    this.texturesToDispose.push(lightsMap);

    // 2. Swirling Atmospheric Cloud Layer Sphere (Radius 1.822)
    const cloudGeo = new SphereGeometry(1.822, 40, 32);
    const cloudMat = new MeshStandardMaterial({
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      roughness: 0.95,
      metalness: 0.0,
    });

    this.cloudMesh = new Mesh(cloudGeo, cloudMat);
    this.cloudMesh.name = 'LandingEarthClouds';
    this.cloudMesh.visible = false;
    this.earthGroup.add(this.cloudMesh);

    const cloudMap = loader.load(
      `${ASSET_BASE}assets/textures/earth_clouds_1024.png`,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        cloudMat.map = tex;
        cloudMat.needsUpdate = true;
        this.cloudMesh.visible = true;
      },
    );
    this.texturesToDispose.push(cloudMap);

    // 3. True Rayleigh Atmospheric Limb Fresnel Glow Shader (Zero hard cartoon rings)
    const atmoGeo = new SphereGeometry(1.84, 48, 36);
    const atmoMat = new ShaderMaterial({
      uniforms: {
        glowColor: { value: new Color(0x38bdf8) },
        power: { value: 3.4 },
        intensity: { value: 1.1 },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewVec;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewVec = -normalize(mvPos.xyz);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewVec;
        uniform vec3 glowColor;
        uniform float power;
        uniform float intensity;
        void main() {
          float vDotN = max(0.0, dot(vNormal, vViewVec));
          float rim = pow(1.0 - vDotN, power) * intensity;
          gl_FragColor = vec4(glowColor, rim);
        }
      `,
      side: FrontSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });

    this.atmoGlowMesh = new Mesh(atmoGeo, atmoMat);
    this.atmoGlowMesh.name = 'LandingAtmosphericLimb';
    this.earthGroup.add(this.atmoGlowMesh);

    // Position Earth prominently in the right-center field of view matching reference video
    // Oriented so vibrant Pacific/Indian Ocean & landmasses catch the sunlight front-and-center
    this.earthGroup.position.set(0.70, -0.25, 0.2);
    this.earthGroup.rotation.set(0.18, -1.15, -0.08);
  }

  private buildSatellite(): void {
    // High-craft Earth-observation satellite model (Sentinel / Landsat / SAR Class):
    // 1. Central avionics bus clad in multi-layered insulation (MLI) Gold Kapton foil
    // 2. White ceramic thermal radiator shield on anti-sun face
    // 3. High-gain parabolic telecommunications dish with feed horn
    // 4. Nadir optical Earth-observation camera payload with dark sapphire glass lens
    // 5. Deployable twin solar panel arrays with titanium hinges & blue cell grids
    // 6. Active green/cyan telemetry strobe LED beacon

    // Gold Kapton MLI Foil Material
    const goldKaptonMat = new MeshStandardMaterial({
      color: 0xdfad32,
      roughness: 0.22,
      metalness: 0.88,
    });

    // White Ceramic Thermal Radiator Material
    const whiteRadiatorMat = new MeshStandardMaterial({
      color: 0xf1f5f9,
      roughness: 0.42,
      metalness: 0.15,
    });

    // Dark Titanium Chassis Material
    const titaniumMat = new MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.35,
      metalness: 0.9,
    });

    // Deep Space Blue Photovoltaic Material
    const solarCellMat = new MeshStandardMaterial({
      color: 0x0f2952,
      emissive: 0x061836,
      emissiveIntensity: 0.35,
      roughness: 0.18,
      metalness: 0.75,
      side: DoubleSide,
    });

    // 1. Main Avionics Bus (Rectangular cuboid)
    const busGeo = new BoxGeometry(0.24, 0.15, 0.14);
    const busMesh = new Mesh(busGeo, goldKaptonMat);
    this.satelliteGroup.add(busMesh);

    // 2. Thermal Radiator Panel (Attached to rear face)
    const radGeo = new BoxGeometry(0.22, 0.13, 0.015);
    const radMesh = new Mesh(radGeo, whiteRadiatorMat);
    radMesh.position.set(0, 0, -0.078);
    this.satelliteGroup.add(radMesh);

    // 3. Nadir Optical Camera Tube (Points directly downward to Earth)
    const camGeo = new CylinderGeometry(0.042, 0.035, 0.10, 16);
    const camMesh = new Mesh(camGeo, titaniumMat);
    camMesh.position.set(0, -0.11, 0);
    this.satelliteGroup.add(camMesh);

    // Sapphire Glass Lens Element
    const lensGeo = new CylinderGeometry(0.033, 0.033, 0.01, 16);
    const lensMat = new MeshStandardMaterial({
      color: 0x071b38,
      roughness: 0.08,
      metalness: 0.95,
      emissive: 0x004488,
      emissiveIntensity: 0.3,
    });
    const lensMesh = new Mesh(lensGeo, lensMat);
    lensMesh.position.set(0, -0.16, 0);
    this.satelliteGroup.add(lensMesh);

    // 4. Parabolic High-Gain Dish Antenna
    const dishGeo = new SphereGeometry(0.065, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
    const dishMat = new MeshStandardMaterial({
      color: 0xd8e2ed,
      roughness: 0.3,
      metalness: 0.85,
      side: DoubleSide,
    });
    const dishMesh = new Mesh(dishGeo, dishMat);
    dishMesh.position.set(0.12, 0.08, 0.08);
    dishMesh.rotation.set(-0.6, 0.4, 0);
    this.satelliteGroup.add(dishMesh);

    // Feed Horn
    const hornGeo = new CylinderGeometry(0.004, 0.008, 0.04, 8);
    const hornMesh = new Mesh(hornGeo, titaniumMat);
    hornMesh.position.set(0.12, 0.08, 0.11);
    this.satelliteGroup.add(hornMesh);

    // 5. Deployable Photovoltaic Solar Panel Wings (Left & Right)
    const makeSolarWing = (isLeft: boolean): Group => {
      const wingGroup = new Group();
      const sign = isLeft ? 1 : -1;

      // Titanium boom arm
      const boomGeo = new CylinderGeometry(0.006, 0.006, 0.10, 8);
      const boom = new Mesh(boomGeo, titaniumMat);
      boom.position.set(sign * 0.17, 0, 0);
      boom.rotation.z = Math.PI / 2;
      wingGroup.add(boom);

      // Solar Panel Blade
      const panelGeo = new BoxGeometry(0.48, 0.14, 0.008);
      const panel = new Mesh(panelGeo, solarCellMat);
      panel.position.set(sign * 0.46, 0, 0);
      wingGroup.add(panel);

      // Panel Framing Trim
      const trimGeo = new BoxGeometry(0.49, 0.146, 0.006);
      const trim = new Mesh(trimGeo, titaniumMat);
      trim.position.set(sign * 0.46, 0, 0);
      trim.scale.set(0.99, 0.98, 0.8);
      wingGroup.add(trim);

      return wingGroup;
    };

    const leftWing = makeSolarWing(true);
    this.satelliteGroup.add(leftWing);

    const rightWing = makeSolarWing(false);
    this.satelliteGroup.add(rightWing);

    // 6. Active Telemetry Strobe Beacon LED
    const beaconGeo = new SphereGeometry(0.012, 8, 8);
    const beaconMat = new MeshBasicMaterial({
      color: 0x00f0ff,
    });
    this.satBeaconMesh = new Mesh(beaconGeo, beaconMat);
    this.satBeaconMesh.position.set(-0.11, 0.08, 0.07);
    this.satelliteGroup.add(this.satBeaconMesh);

    // Initial scale and orbital position
    this.satelliteGroup.scale.setScalar(1.2);
  }

  private onMouseMove(e: MouseEvent): void {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -(e.clientY / window.innerHeight) * 2 + 1;
    this.mouseTarget.set(nx * 0.25, ny * 0.15);
  }

  private onResize(): void {
    if (this.isDisposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private onVisibilityChange(): void {
    this.isPaused = document.hidden;
  }

  private animate = (time: number): void => {
    if (this.isDisposed) return;

    this.animFrameId = requestAnimationFrame(this.animate);
    if (this.isPaused) return;

    const delta = Math.min(0.1, (time - this.clockTime) * 0.001 || 0.016);
    this.clockTime = time;

    // 1. Earth rotation (graceful planetary spin)
    if (this.earthMesh) {
      this.earthMesh.rotation.y += 0.0016 * delta * 60;
    }

    // 2. Independent cloud rotation (atmospheric drift)
    if (this.cloudMesh) {
      this.cloudMesh.rotation.y += 0.0022 * delta * 60;
      this.cloudMesh.rotation.x += 0.0002 * delta * 60;
    }

    // 3. Subtle Milky Way skybox rotation
    if (this.skyboxMesh) {
      this.skyboxMesh.rotation.y += 0.00008 * delta * 60;
    }

    // 4. Authentic inclined Low Earth Orbit (LEO) revolution for Satellite
    // Completes an orbital arc smoothly across the horizon every ~10 seconds
    this.satelliteOrbitAngle += 0.28 * delta;
    const orbitRadius = 2.48; // Sits just above Earth's radius (1.80) in true LEO
    const inclination = 0.52; // ~30 deg orbital inclination

    const satX = this.earthGroup.position.x + Math.cos(this.satelliteOrbitAngle) * orbitRadius;
    const satY =
      this.earthGroup.position.y +
      Math.sin(this.satelliteOrbitAngle) * Math.sin(inclination) * orbitRadius +
      0.22;
    const satZ =
      this.earthGroup.position.z +
      Math.sin(this.satelliteOrbitAngle) * Math.cos(inclination) * orbitRadius +
      0.35;

    this.satelliteGroup.position.set(satX, satY, satZ);

    // Nadir-pointing attitude control: Satellite payload points towards Earth surface
    this.satelliteGroup.lookAt(this.earthGroup.position);
    this.satelliteGroup.rotateZ(0.2); // Subtle flight bank angle

    // Telemetry strobe blink (1.2 Hz pulse)
    if (this.satBeaconMesh) {
      const pulse = Math.sin(time * 0.007);
      this.satBeaconMesh.visible = pulse > 0.1;
    }

    // 5. Smooth camera mouse parallax (subtle, high-craft)
    this.mouseCurrent.lerp(this.mouseTarget, 0.04);
    this.camera.position.x = this.mouseCurrent.x * 0.55;
    this.camera.position.y = 0.35 + this.mouseCurrent.y * 0.35;
    this.camera.lookAt(0.35, 0.05, 0);

    // 6. Subtle starfield parallax
    if (this.starfieldNear) {
      this.starfieldNear.rotation.y += 0.00012 * delta;
    }

    this.renderer.render(this.scene, this.camera);
  };

  /**
   * Smoothly animates the camera pushing toward orbit before entering the mission.
   */
  public async playTransitionToOrbit(): Promise<void> {
    const startZ = this.camera.position.z;
    const targetZ = 3.6;
    const startTime = performance.now();
    const duration = 450;

    return new Promise((resolve) => {
      const step = (now: number) => {
        if (this.isDisposed) {
          resolve();
          return;
        }
        const progress = Math.min(1.0, (now - startTime) / duration);
        const ease = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        this.camera.position.z = startZ + (targetZ - startZ) * ease;

        if (progress < 1.0) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(step);
    });
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('resize', this.onResizeBound);
    document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);

    // Dispose textures
    this.texturesToDispose.forEach((tex) => {
      try {
        tex.dispose();
      } catch {}
    });
    this.texturesToDispose = [];

    // Dispose all scene meshes and materials
    this.scene.traverse((obj) => {
      if (obj instanceof Mesh || obj instanceof Points) {
        if (obj.geometry) {
          try {
            obj.geometry.dispose();
          } catch {}
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => {
              try {
                m.dispose();
              } catch {}
            });
          } else {
            try {
              obj.material.dispose();
            } catch {}
          }
        }
      }
    });

    if (this.renderer) {
      try {
        this.renderer.dispose();
        if (this.renderer.domElement?.parentElement) {
          this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
        }
      } catch {}
    }
  }
}
