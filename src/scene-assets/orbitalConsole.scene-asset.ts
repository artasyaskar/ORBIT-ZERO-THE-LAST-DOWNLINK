/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * High-Craft Procedural 3D Architecture: Seated Aerospace Orbital Command Console & Cupola Frame
 *
 * Engineered to match `docs/art-references/orbit-zero-hero-v01.png`:
 * - Brushed silver-titanium ergonomic deck bolster, dark anodized hull, and recessed carbon instrument bays
 * - Left Station: Contoured Dual-Aperture Scanner Dock & 3-Slot Illuminated Evidence Capture Tray
 * - Center Station: Recessed Turbine Globe Gimbal Pedestal & Lower-Hemisphere Emitter Calipers
 * - Right Station: Amber Induction Compression Cradle, 3-Slot Waveguide Downlink Bay & Jettison Chute
 * - Cupola Viewport: Curved Orbital Horizon Atmospheric Limb Arc & Structural Window Mullions
 */

import {
    AdditiveBlending,
    BackSide,
    BufferGeometry,
    Color,
    CylinderGeometry,
    DoubleSide,
    Float32BufferAttribute,
    FrontSide,
    Group,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    PointLight,
    Points,
    PointsMaterial,
    RingGeometry,
    SphereGeometry,
    TorusGeometry,
    Vector3,
} from '@iwsdk/core';
import {
    alignSpan,
    bevelBox,
    mergeStaticMeshesByMaterial,
    mergeStaticMeshesIntoBakedMaterial,
    taperPlate,
} from './lib/hardsurface';
import { installCubeStationAnchors } from '../systems/cubeInteractions';
import { TACTICAL_PALETTE, EMISSION_INTENSITIES } from './lib/tacticalPalette';

export function createOrbitalConsoleAsset(): Object3D {
    const root = new Group();
    root.name = 'OrbitalConsole';

    // RC10.0 Tactical Aerospace Material Library (Deepest Midnight Aerospace Aesthetic)
    const hullDarkMat = new MeshStandardMaterial({
        color: 0x08111e,
        roughness: 0.35,
        metalness: 0.85,
    });
    const deskDeckMat = new MeshStandardMaterial({
        color: 0x08111e,
        roughness: 0.34,
        metalness: 0.82,
    });
    const titaniumRimMat = new MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.22,
        metalness: 0.90,
    });
    const gunmetalBezelMat = new MeshStandardMaterial({
        color: 0x0d1c2e,
        roughness: 0.40,
        metalness: 0.65,
    });
    const carbonWellMat = new MeshStandardMaterial({
        color: 0x050b14,
        roughness: 0.38,
        metalness: 0.80,
    });
    const cyanAccentMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.electricCyan,
        emissive: TACTICAL_PALETTE.electricCyan,
        emissiveIntensity: EMISSION_INTENSITIES.moderate,
        roughness: 0.25,
        metalness: 0.3,
    });
    const amberInductionMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.tacticalAmber,
        emissive: TACTICAL_PALETTE.tacticalAmber,
        emissiveIntensity: EMISSION_INTENSITIES.strong,
        roughness: 0.25,
        metalness: 0.45,
    });
    const copperClampMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.tacticalAmber,
        roughness: 0.28,
        metalness: 0.85,
    });
    const emeraldWaveguideMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.sarEmerald,
        emissive: TACTICAL_PALETTE.sarEmerald,
        emissiveIntensity: EMISSION_INTENSITIES.moderate,
        roughness: 0.25,
        metalness: 0.35,
    });
    const coralHazardMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.dangerCrimson,
        emissive: TACTICAL_PALETTE.dangerCrimson,
        emissiveIntensity: EMISSION_INTENSITIES.moderate,
        roughness: 0.3,
        metalness: 0.3,
    });
    const hazardStripeMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.tacticalAmber,
        roughness: 0.42,
        metalness: 0.35,
    });
    const floodLightWarmMat = new MeshStandardMaterial({
        color: 0xffedd5,
        emissive: TACTICAL_PALETTE.tacticalAmber,
        emissiveIntensity: EMISSION_INTENSITIES.strong,
        roughness: 0.2,
        metalness: 0.1,
    });
    const conduitMat = new MeshStandardMaterial({
        color: TACTICAL_PALETTE.voidObsidian,
        roughness: 0.75,
        metalness: 0.2,
    });
    const deckPlateFloorMat = hullDarkMat;

    // 1. Pedestal Base & Recessed Aerospace Support Architecture
    const baseGroup = new Group();
    baseGroup.name = 'PedestalBase';

    const floorPlate = new Mesh(
        bevelBox(2.80, 0.045, 1.80, 0.01, 0.035, 3),
        hullDarkMat,
    );
    floorPlate.name = 'FloorBasePlate';
    floorPlate.position.set(0, 0.022, 0.04);
    baseGroup.add(floorPlate);

    const centerCoreColumn = new Mesh(
        bevelBox(0.68, 0.72, 0.58, 0.016, 0.035, 3),
        hullDarkMat,
    );
    centerCoreColumn.name = 'CenterSupportColumn';
    centerCoreColumn.position.set(0, 0.38, -0.22);
    baseGroup.add(centerCoreColumn);

    // Recessed pedestal foot trim with warm cyan accent glow
    const pedestalTrim = new Mesh(
        bevelBox(0.72, 0.018, 0.62, 0.004, 0.008, 2),
        titaniumRimMat,
    );
    pedestalTrim.name = 'PedestalTrimBolster';
    pedestalTrim.position.set(0, 0.032, -0.22);
    baseGroup.add(pedestalTrim);

    // 2. Wrap-Around Aerospace Console Deck (y = 0.75m - 0.78m)
    const deckGroup = new Group();
    deckGroup.name = 'ConsoleDeck';

    // Center Console Bridge spanning continuously forward to the window sill (Concept Images 1 & 2)
    const centerBridgeHull = new Mesh(
        bevelBox(1.50, 0.056, 1.20, 0.012, 0.028, 3),
        deskDeckMat,
    );
    centerBridgeHull.name = 'CenterDeckHull';
    centerBridgeHull.position.set(0, 0.748, -0.28);
    deckGroup.add(centerBridgeHull);

    // Left & Right Wraparound Console Wing Decks (Full 3.4m Cockpit Span - Concept Images 1 & 2)
    const leftWingDeck = new Mesh(
        bevelBox(1.20, 0.056, 1.25, 0.012, 0.028, 3),
        deskDeckMat,
    );
    leftWingDeck.name = 'LeftWingDeck';
    leftWingDeck.position.set(-1.15, 0.748, -0.22);
    leftWingDeck.rotation.set(0, 0.22, 0);
    deckGroup.add(leftWingDeck);

    const rightWingDeck = new Mesh(
        bevelBox(1.20, 0.056, 1.25, 0.012, 0.028, 3),
        deskDeckMat,
    );
    rightWingDeck.name = 'RightWingDeck';
    rightWingDeck.position.set(1.15, 0.748, -0.22);
    rightWingDeck.rotation.set(0, -0.22, 0);
    deckGroup.add(rightWingDeck);

    // Brushed Titanium Ergonomic Front Cowling Lip (Center Seated Cutout)
    const frontTitaniumLip = new Mesh(
        bevelBox(1.10, 0.028, 0.052, 0.007, 0.014, 3),
        titaniumRimMat,
    );
    frontTitaniumLip.name = 'FrontTitaniumBolster';
    frontTitaniumLip.position.set(0, 0.768, 0.22);
    deckGroup.add(frontTitaniumLip);

    const leftWingLip = new Mesh(
        bevelBox(1.25, 0.028, 0.052, 0.007, 0.014, 3),
        titaniumRimMat,
    );
    leftWingLip.name = 'LeftWingTitaniumLip';
    leftWingLip.position.set(-1.02, 0.768, 0.32);
    leftWingLip.rotation.set(0, 0.22, 0);
    deckGroup.add(leftWingLip);

    const rightWingLip = new Mesh(
        bevelBox(1.25, 0.028, 0.052, 0.007, 0.014, 3),
        titaniumRimMat,
    );
    rightWingLip.name = 'RightWingTitaniumLip';
    rightWingLip.position.set(1.02, 0.768, 0.32);
    rightWingLip.rotation.set(0, -0.22, 0);
    deckGroup.add(rightWingLip);

    // Left & Right Console Wing Horizontal Amber Accent Bars (100% Concept Image 1 & 2 Match)
    const wingAccentBarGeo = bevelBox(0.85, 0.008, 0.012, 0.001, 0.002, 1);
    const warmLedMat = new MeshStandardMaterial({
        color: 0xffedd5,
        emissive: 0xf59e0b,
        emissiveIntensity: 3.5,
        roughness: 0.15,
    });

    const leftWingGlowBar = new Mesh(wingAccentBarGeo, warmLedMat);
    leftWingGlowBar.name = 'LeftWingWarmAccentBar';
    leftWingGlowBar.position.set(-0.95, 0.776, 0.33);
    leftWingGlowBar.rotation.set(0, 0.22, 0);
    deckGroup.add(leftWingGlowBar);

    const rightWingGlowBar = new Mesh(wingAccentBarGeo, warmLedMat);
    rightWingGlowBar.name = 'RightWingWarmAccentBar';
    rightWingGlowBar.position.set(0.95, 0.776, 0.33);
    rightWingGlowBar.rotation.set(0, -0.22, 0);
    deckGroup.add(rightWingGlowBar);

    // Rear Cowling Rim behind console
    const rearTitaniumCowling = new Mesh(
        bevelBox(1.36, 0.036, 0.042, 0.008, 0.014, 3),
        gunmetalBezelMat,
    );
    rearTitaniumCowling.name = 'RearConsoleCowling';
    rearTitaniumCowling.position.set(0, 0.774, -0.84);
    deckGroup.add(rearTitaniumCowling);

    // Recessed Center Evidence Cube Docking Bay Module (Concept Images 1 & 2 Match)
    const centerDockBezel = new Mesh(
        bevelBox(0.40, 0.022, 0.15, 0.005, 0.010, 2),
        titaniumRimMat,
    );
    centerDockBezel.name = 'CenterCubeDockBezel';
    centerDockBezel.position.set(0, 0.772, -0.44);
    deckGroup.add(centerDockBezel);

    // Raised Aerospace End Bumpers on Left & Right of Evidence Dock (Concept Art Detail)
    const bumperGeo = bevelBox(0.018, 0.028, 0.14, 0.003, 0.006, 2);
    const leftBumper = new Mesh(bumperGeo, titaniumRimMat);
    leftBumper.name = 'CenterCubeDockLeftBumper';
    leftBumper.position.set(-0.20, 0.785, -0.44);
    deckGroup.add(leftBumper);

    const rightBumper = new Mesh(bumperGeo, titaniumRimMat);
    rightBumper.name = 'CenterCubeDockRightBumper';
    rightBumper.position.set(0.20, 0.785, -0.44);
    deckGroup.add(rightBumper);

    // 3 Illuminated Docking Wells with Glowing Floor Pads & Slot Frame Collars
    const wellSlotPositions: [number, number, number][] = [
        [-0.10, 0.778, -0.44],
        [0.00, 0.778, -0.44],
        [0.10, 0.778, -0.44],
    ];
    for (let w = 0; w < 3; w++) {
        const wellPad = new Mesh(
            bevelBox(0.078, 0.004, 0.078, 0.001, 0.003, 1),
            w === 2 ? amberInductionMat : cyanAccentMat,
        );
        wellPad.name = `CubeDockWellGlow_${w + 1}`;
        wellPad.position.set(wellSlotPositions[w][0], wellSlotPositions[w][1], wellSlotPositions[w][2]);
        deckGroup.add(wellPad);

        const slotRim = new Mesh(
            bevelBox(0.086, 0.008, 0.086, 0.0015, 0.003, 1),
            gunmetalBezelMat,
        );
        slotRim.name = `CubeDockSlotRim_${w + 1}`;
        slotRim.position.set(wellSlotPositions[w][0], wellSlotPositions[w][1] + 0.003, wellSlotPositions[w][2]);
        deckGroup.add(slotRim);
    }

    // Left & Right Aerospace Toggle Switches & Rotary Knobs (reuse shared materials for static merge)
    const toggleBasePlateMat = gunmetalBezelMat;
    const toggleStemChromeMat = titaniumRimMat;
    const indicatorLedMat = cyanAccentMat;
    const indicatorAmberMat = amberInductionMat;
    const indicatorEmeraldMat = emeraldWaveguideMat;

    // Interactive Left Console Sensor Mode Toggle Switch (Optical <-> SAR Radar)
    const sensorSwitchGroup = new Group();
    sensorSwitchGroup.name = 'SensorToggleSwitch';
    sensorSwitchGroup.position.set(-0.25, 0.787, -0.34);

    const sensorPlate = new Mesh(bevelBox(0.026, 0.005, 0.040, 0.001, 0.002, 1), toggleBasePlateMat);
    sensorPlate.name = 'SensorSwitchPlate';
    sensorSwitchGroup.add(sensorPlate);

    const sensorStem = new Mesh(new CylinderGeometry(0.004, 0.0055, 0.028, 8), toggleStemChromeMat);
    sensorStem.name = 'SensorToggleStem';
    sensorStem.position.set(0, 0.012, 0);
    sensorStem.rotation.set(0.38, 0, 0); // Default Optical: +0.38 rad
    sensorSwitchGroup.add(sensorStem);

    const sensorLed = new Mesh(new CylinderGeometry(0.0028, 0.0028, 0.002, 6), indicatorLedMat);
    sensorLed.name = 'SensorSwitchLed';
    sensorLed.position.set(0, 0.0035, 0.014);
    sensorSwitchGroup.add(sensorLed);
    deckGroup.add(sensorSwitchGroup);

    // Left console wing aux switch cluster (Power bus, Telemetry lock, Uplink band)
    for (let s = 1; s < 4; s++) {
        const swPlate = new Mesh(bevelBox(0.024, 0.005, 0.038, 0.001, 0.002, 1), toggleBasePlateMat);
        swPlate.position.set(-0.25 - s * 0.036, 0.787, -0.34);
        deckGroup.add(swPlate);

        const swStem = new Mesh(new CylinderGeometry(0.004, 0.0055, 0.026, 12), toggleStemChromeMat);
        swStem.position.set(-0.25 - s * 0.036, 0.798, -0.34);
        swStem.rotation.set((s % 2 === 0 ? 0.38 : -0.38), 0, 0);
        deckGroup.add(swStem);

        const swLed = new Mesh(new CylinderGeometry(0.0025, 0.0025, 0.002, 8), s === 2 ? indicatorAmberMat : indicatorLedMat);
        swLed.position.set(-0.25 - s * 0.036, 0.790, -0.326);
        deckGroup.add(swLed);
    }

    // Left wing knurled rotary dials (Frequency & Range select)
    for (let r = 0; r < 2; r++) {
        const knob = new Mesh(new CylinderGeometry(0.018, 0.020, 0.014, 20), toggleBasePlateMat);
        knob.position.set(-0.41 - r * 0.044, 0.788, -0.34);
        deckGroup.add(knob);

        const knobCap = new Mesh(new CylinderGeometry(0.013, 0.013, 0.004, 16), toggleStemChromeMat);
        knobCap.position.set(-0.41 - r * 0.044, 0.796, -0.34);
        deckGroup.add(knobCap);
    }

    // Right console wing rotary knobs & switches: 2 knurled dials + 2 toggles
    for (let r = 0; r < 2; r++) {
        const knob = new Mesh(new CylinderGeometry(0.020, 0.022, 0.016, 20), toggleBasePlateMat);
        knob.position.set(0.24 + r * 0.046, 0.788, -0.34);
        deckGroup.add(knob);

        const knobCap = new Mesh(new CylinderGeometry(0.014, 0.014, 0.004, 16), toggleStemChromeMat);
        knobCap.position.set(0.24 + r * 0.046, 0.797, -0.34);
        deckGroup.add(knobCap);
    }

    for (let s = 0; s < 2; s++) {
        const swPlate = new Mesh(bevelBox(0.024, 0.005, 0.038, 0.001, 0.002, 1), toggleBasePlateMat);
        swPlate.position.set(0.35 + s * 0.036, 0.787, -0.34);
        deckGroup.add(swPlate);

        const swStem = new Mesh(new CylinderGeometry(0.004, 0.0055, 0.026, 12), toggleStemChromeMat);
        swStem.position.set(0.35 + s * 0.036, 0.798, -0.34);
        swStem.rotation.set((s % 2 === 0 ? 0.38 : -0.38), 0, 0);
        deckGroup.add(swStem);
    }

    // Right console status indicator matrix pad (Concept Images 1 & 2 detail)
    const keypadBase = new Mesh(bevelBox(0.052, 0.005, 0.044, 0.001, 0.002, 1), toggleBasePlateMat);
    keypadBase.position.set(0.44, 0.787, -0.34);
    deckGroup.add(keypadBase);

    for (let kp = 0; kp < 6; kp++) {
        const kpx = -0.016 + (kp % 3) * 0.016;
        const kpz = -0.010 + Math.floor(kp / 3) * 0.020;
        const keyLed = new Mesh(new CylinderGeometry(0.003, 0.003, 0.002, 6), kp === 1 ? indicatorAmberMat : (kp === 4 ? indicatorEmeraldMat : indicatorLedMat));
        keyLed.position.set(0.44 + kpx, 0.790, -0.34 + kpz);
        deckGroup.add(keyLed);
    }

    // (LeftWingSlab & RightWingSlab replaced by full-span LeftWingDeck & RightWingDeck above)

    // 3. LEFT STATION: Handheld Dual-Aperture Scanner Dock & 3-Slot Evidence Cube Capture Tray
    const scannerDockOuter = new Mesh(
        bevelBox(0.135, 0.018, 0.165, 0.004, 0.012, 3),
        titaniumRimMat,
    );
    scannerDockOuter.name = 'ScannerHolsterBezel';
    scannerDockOuter.position.set(-0.44, 0.778, 0.26);
    scannerDockOuter.visible = true;
    deckGroup.add(scannerDockOuter);

    const scannerDockWell = new Mesh(
        bevelBox(0.108, 0.016, 0.138, 0.003, 0.008, 2),
        carbonWellMat,
    );
    scannerDockWell.name = 'ScannerHolsterWell';
    scannerDockWell.position.set(-0.44, 0.782, 0.26);
    scannerDockWell.visible = true;
    deckGroup.add(scannerDockWell);

    // 3-Slot Raw Evidence Cube Tray (centered at world [-0.31, 0.792, -0.42] -> local [-0.31, 0.778, 0.14])
    const trayOuterBezel = new Mesh(
        bevelBox(0.27, 0.018, 0.125, 0.004, 0.014, 3),
        titaniumRimMat,
    );
    trayOuterBezel.name = 'RawCubeTrayBezel';
    trayOuterBezel.position.set(-0.31, 0.778, 0.14);
    trayOuterBezel.visible = true;
    deckGroup.add(trayOuterBezel);

    const trayDarkBed = new Mesh(
        bevelBox(0.246, 0.016, 0.102, 0.003, 0.01, 2),
        carbonWellMat,
    );
    trayDarkBed.name = 'RawCubeTrayBed';
    trayDarkBed.position.set(-0.31, 0.781, 0.14);
    trayDarkBed.visible = true;
    deckGroup.add(trayDarkBed);

    const rawSlotX = [-0.38, -0.31, -0.24];
    const socketRingGeo = bevelBox(0.068, 0.006, 0.076, 0.0015, 0.006, 2);
    for (let i = 0; i < 3; i++) {
        const socketFrame = new Mesh(socketRingGeo, gunmetalBezelMat);
        socketFrame.name = `RawTraySocket_${i + 1}`;
        socketFrame.position.set(rawSlotX[i], 0.788, 0.14);
        socketFrame.visible = true;
        deckGroup.add(socketFrame);
    }

    const trayAccentPipe = new Mesh(
        bevelBox(0.23, 0.005, 0.006, 0.001, 0.002, 2),
        cyanAccentMat,
    );
    trayAccentPipe.name = 'LeftTrayLedStrip';
    trayAccentPipe.position.set(-0.31, 0.788, 0.194);
    trayAccentPipe.visible = true;
    deckGroup.add(trayAccentPipe);

    // 4. CENTER STATION: Recessed Turbine Globe Gimbal Pedestal (local [0, 0.78, -0.02])
    const gimbalGroup = new Group();
    gimbalGroup.name = 'GlobeGimbalMount';
    gimbalGroup.position.set(0, 0.778, -0.02);

    const gimbalOuterCollar = new Mesh(
        new CylinderGeometry(0.215, 0.235, 0.026, 20), // Reduced from 28 segments to 20
        titaniumRimMat,
    );
    gimbalOuterCollar.name = 'GimbalOuterCollar';
    gimbalGroup.add(gimbalOuterCollar);

    const gimbalInnerWell = new Mesh(
        new CylinderGeometry(0.185, 0.175, 0.028, 18), // Reduced from 24 segments to 18
        carbonWellMat,
    );
    gimbalInnerWell.name = 'GimbalInnerWell';
    gimbalInnerWell.position.set(0, 0.002, 0);
    gimbalGroup.add(gimbalInnerWell);

    const gimbalEmitterRing = new Mesh(
        new TorusGeometry(0.196, 0.005, 8, 36),
        cyanAccentMat,
    );
    gimbalEmitterRing.name = 'GimbalAzimuthRing';
    gimbalEmitterRing.rotation.set(Math.PI / 2, 0, 0);
    gimbalEmitterRing.position.set(0, 0.015, 0);
    gimbalGroup.add(gimbalEmitterRing);

    // 4 Angled Lower-Hemisphere Projector Calipers (frames the globe base without blocking upper view)
    const caliperGeo = bevelBox(0.018, 0.065, 0.024, 0.003, 0.004, 2);
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = 0.195;
        const caliper = new Mesh(caliperGeo, gunmetalBezelMat);
        caliper.name = `GimbalProjectorCaliper_${i + 1}`;
        caliper.position.set(Math.cos(angle) * r, 0.032, Math.sin(angle) * r);
        caliper.rotation.set(0, -angle + Math.PI / 2, 0.35);
        gimbalGroup.add(caliper);
    }

    gimbalGroup.visible = false;

    // =========================================================================
    // 4b. CENTRAL CIRCULAR HOLOGRAPHIC WAR-ROOM TACTICAL PROJECTOR TABLE
    // (Signature Feature: Matching Visual Concepts 05 & 07, devpost war-room reference)
    // =========================================================================
    function buildCircularHoloWarTable(): Group {
        const holoTable = new Group();
        holoTable.name = 'HoloTacticalWarTable';
        holoTable.position.set(0, 0.779, -0.05);

        // Cyan and amber glow parts share one additive material; each part carries its own colour and opacity
        // as RGBA vertex colours, so the static merge makes all the rings and nodes one draw call.
        const holoGlowMat = new MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: true,
            transparent: true,
            blending: AdditiveBlending,
        });
        const glowTint = new Color();
        const holoGlowGeometry = (source: BufferGeometry, hex: number, opacity: number): BufferGeometry => {
            const geometry = source.clone();
            glowTint.setHex(hex);
            const rgba = new Float32Array(geometry.getAttribute('position').count * 4);
            for (let i = 0; i < rgba.length; i += 4) {
                rgba[i] = glowTint.r;
                rgba[i + 1] = glowTint.g;
                rgba[i + 2] = glowTint.b;
                rgba[i + 3] = opacity;
            }
            geometry.setAttribute('color', new Float32BufferAttribute(rgba, 4));
            return geometry;
        };
        const holoCyan = (source: BufferGeometry) => holoGlowGeometry(source, 0x00f0ff, 0.88);
        const holoAmber = (source: BufferGeometry) => holoGlowGeometry(source, 0xf59e0b, 0.82);

        // 1. Heavy Chamfered Titanium Collar Frame & Recessed Dark Carbon Core
        const outerBezel = new Mesh(
            new CylinderGeometry(0.58, 0.60, 0.016, 24),
            titaniumRimMat,
        );
        outerBezel.name = 'HoloTableBezelCollar';
        outerBezel.position.set(0, 0.008, 0);
        holoTable.add(outerBezel);

        const innerWell = new Mesh(
            new CylinderGeometry(0.555, 0.545, 0.018, 24),
            carbonWellMat,
        );
        innerWell.name = 'HoloTableCarbonWell';
        innerWell.position.set(0, 0.010, 0);
        holoTable.add(innerWell);

        // 2. Concentric Holographic Emissive Energy Rings (shared materials for static merge)
        const outerGlowRing = new Mesh(
            holoCyan(new TorusGeometry(0.55, 0.0035, 6, 24)),
            holoGlowMat,
        );
        outerGlowRing.name = 'HoloRingOuterCyan';
        outerGlowRing.rotation.set(Math.PI / 2, 0, 0);
        outerGlowRing.position.set(0, 0.020, 0);
        holoTable.add(outerGlowRing);

        const midTacticalRing = new Mesh(
            holoAmber(new TorusGeometry(0.38, 0.0028, 6, 24)),
            holoGlowMat,
        );
        midTacticalRing.name = 'HoloRingMidAmber';
        midTacticalRing.rotation.set(Math.PI / 2, 0, 0);
        midTacticalRing.position.set(0, 0.021, 0);
        holoTable.add(midTacticalRing);

        const innerOrbitRing = new Mesh(
            holoCyan(new TorusGeometry(0.24, 0.0024, 6, 24)),
            holoGlowMat,
        );
        innerOrbitRing.name = 'HoloRingInnerCyan';
        innerOrbitRing.rotation.set(Math.PI / 2, 0, 0);
        innerOrbitRing.position.set(0, 0.022, 0);
        holoTable.add(innerOrbitRing);

        // 3. Radial Compass Azimuth Strips + Inter-Node Tactical Links merged into holoGlowMat (0 extra draw calls)
        const linePairs: Array<[number, number, number, number, number, number]> = [
            [-0.28, 0.022, -0.18, 0.00, 0.023, -0.14],
            [0.00, 0.023, -0.14, -0.22, 0.022, 0.12],
            [0.00, 0.023, -0.14, 0.22, 0.022, 0.12],
            [0.00, 0.023, -0.14, 0.28, 0.022, -0.18],
            [0.22, 0.022, 0.12, 0.00, 0.022, 0.22],
            [-0.22, 0.022, 0.12, 0.00, 0.022, 0.22],
        ];
        for (let i = 0; i < 12; i++) {
            const angle = (i / 12) * Math.PI * 2;
            const r1 = 0.24;
            const r2 = 0.54;
            linePairs.push([
                Math.cos(angle) * r1, 0.021, Math.sin(angle) * r1,
                Math.cos(angle) * r2, 0.021, Math.sin(angle) * r2,
            ]);
        }
        const stripPositions: number[] = [];
        const stripNormals: number[] = [];
        const stripIndices: number[] = [];
        const halfW = 0.0012;
        let stripV = 0;
        for (const [x1, y1, z1, x2, y2, z2] of linePairs) {
            const dx = x2 - x1;
            const dz = z2 - z1;
            const len = Math.hypot(dx, dz) || 1;
            const nx = (-dz / len) * halfW;
            const nz = (dx / len) * halfW;
            stripPositions.push(
                x1 - nx, y1, z1 - nz,
                x1 + nx, y1, z1 + nz,
                x2 + nx, y2, z2 + nz,
                x2 - nx, y2, z2 - nz,
            );
            stripNormals.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
            stripIndices.push(stripV, stripV + 1, stripV + 2, stripV, stripV + 2, stripV + 3);
            stripV += 4;
        }
        const radialLineGeo = new BufferGeometry();
        radialLineGeo.setAttribute('position', new Float32BufferAttribute(stripPositions, 3));
        radialLineGeo.setAttribute('normal', new Float32BufferAttribute(stripNormals, 3));
        radialLineGeo.setIndex(stripIndices);
        const radialLines = new Mesh(
            holoGlowGeometry(radialLineGeo, 0x0ea5e9, 0.55),
            holoGlowMat,
        );
        radialLines.name = 'HoloCompassRadialLines';
        holoTable.add(radialLines);

        // 4. Tactical Data Network Nodes (one shared material, so the static merge folds them into the rings' draw)
        const nodeGroup = new Group();
        nodeGroup.name = 'HoloTacticalNodes';

        const nodesData = [
            { id: 'NODE_SAT', pos: [-0.28, 0.022, -0.18], amber: false },
            { id: 'NODE_STATION', pos: [0.28, 0.022, -0.18], amber: true },
            { id: 'NODE_FLOOD', pos: [0.00, 0.023, -0.14], amber: false },
            { id: 'NODE_HIGHWAY', pos: [-0.22, 0.022, 0.12], amber: false },
            { id: 'NODE_SPUR', pos: [0.22, 0.022, 0.12], amber: true },
            { id: 'NODE_RESCUE', pos: [0.00, 0.022, 0.22], amber: false },
        ];

        const nodeRingGeo = new TorusGeometry(0.022, 0.0016, 4, 12);
        const nodeCoreGeo = new SphereGeometry(0.006, 6, 6);
        const nodeRingCyan = holoCyan(nodeRingGeo);
        const nodeRingAmber = holoAmber(nodeRingGeo);
        const nodeCoreCyan = holoCyan(nodeCoreGeo);
        const nodeCoreAmber = holoAmber(nodeCoreGeo);

        for (const n of nodesData) {
            const nGroup = new Group();
            nGroup.name = n.id;
            nGroup.position.set(n.pos[0], n.pos[1], n.pos[2]);

            const ringMesh = new Mesh(n.amber ? nodeRingAmber : nodeRingCyan, holoGlowMat);
            ringMesh.rotation.set(Math.PI / 2, 0, 0);
            nGroup.add(ringMesh);

            const coreMesh = new Mesh(n.amber ? nodeCoreAmber : nodeCoreCyan, holoGlowMat);
            nGroup.add(coreMesh);

            nodeGroup.add(nGroup);
        }
        holoTable.add(nodeGroup);

        // 5. Rotating Holographic Radar Sweep Blade
        const sweepGeo = new RingGeometry(0.04, 0.54, 12, 1, 0, Math.PI / 4);
        const sweepMat = new MeshBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.18,
            blending: AdditiveBlending,
            side: DoubleSide,
            forceSinglePass: true,
            depthWrite: false,
        });
        const sweepMesh = new Mesh(sweepGeo, sweepMat);
        sweepMesh.name = 'TacticalRadarSweepBlade';
        sweepMesh.rotation.set(-Math.PI / 2, 0, 0);
        sweepMesh.position.set(0, 0.023, 0);
        holoTable.add(sweepMesh);

        // 6. Dynamic Specular Point Light (Illuminates Console Surface & Evidences)
        const tablePointLight = new PointLight(0x00f0ff, 2.8, 1.8);
        tablePointLight.name = 'HoloTableProjectorLight';
        tablePointLight.position.set(0, 0.08, 0);
        holoTable.add(tablePointLight);

        // The flood-relief hologram that floated here was cut: it sat behind the globe, and it showed flood
        // terrain in the wildfire and earthquake operations too.

        return holoTable;
    }

    const holoTacticalTable = buildCircularHoloWarTable();
    deckGroup.add(holoTacticalTable);

    // 5. RIGHT STATION: Amber Induction Processing Cradle, 3-Slot Downlink Bay & Jettison Chute
    const cradleOuterHousing = new Mesh(
        bevelBox(0.112, 0.022, 0.118, 0.004, 0.012, 3),
        copperClampMat,
    );
    cradleOuterHousing.name = 'ProcessingCradleSocket';
    cradleOuterHousing.position.set(0.18, 0.78, 0.07);
    cradleOuterHousing.visible = true;
    deckGroup.add(cradleOuterHousing);

    // Dynamic Processing Cradle Assembly
    const cradleGroup = new Group();
    cradleGroup.name = 'ProcessingCradleAssembly';
    cradleGroup.position.set(0.18, 0.78, 0.07);
    cradleGroup.visible = true;
    deckGroup.add(cradleGroup);

    const cradleInductionCore = new Mesh(
        bevelBox(0.084, 0.024, 0.088, 0.003, 0.008, 2),
        amberInductionMat,
    );
    cradleInductionCore.name = 'ProcessingCradleCore';
    cradleInductionCore.position.set(0, 0.002, 0);
    cradleGroup.add(cradleInductionCore);

    const inductionRingGeo = new TorusGeometry(0.038, 0.0035, 8, 28);
    const inductionRing = new Mesh(inductionRingGeo, amberInductionMat);
    inductionRing.name = 'CradleInductionRing';
    inductionRing.rotation.set(Math.PI / 2, 0, 0);
    inductionRing.position.set(0, 0.014, 0);
    cradleGroup.add(inductionRing);

    const cradleLight = new PointLight(0xf59e0b, 2.2, 1.5);
    cradleLight.name = 'CradleAmberLight';
    cradleLight.position.set(0, 0.04, 0);
    cradleGroup.add(cradleLight);

    const telemetryHoodGeo = bevelBox(0.084, 0.022, 0.024, 0.003, 0.004, 2);
    const telemetryHood = new Mesh(telemetryHoodGeo, gunmetalBezelMat);
    telemetryHood.name = 'CradleTelemetryHood';
    telemetryHood.position.set(0.22, 0.804, 0.038);
    telemetryHood.rotation.set(-0.35, 0, 0);
    telemetryHood.visible = true;
    deckGroup.add(telemetryHood);

    // Raised copper induction clamp jaws on left and right of cradle (dynamic animation targets)
    const clampJawGeo = bevelBox(0.012, 0.028, 0.092, 0.002, 0.004, 2);
    const leftJaw = new Mesh(clampJawGeo, copperClampMat);
    leftJaw.name = 'CradleClampLeft';
    leftJaw.position.set(-0.048, 0.016, 0);
    cradleGroup.add(leftJaw);

    const rightJaw = new Mesh(clampJawGeo, copperClampMat);
    rightJaw.name = 'CradleClampRight';
    rightJaw.position.set(0.048, 0.016, 0);
    cradleGroup.add(rightJaw);
    mergeStaticMeshesByMaterial(cradleGroup, ['CradleClampLeft', 'CradleClampRight']);

    // Discard / Recycle Chute at world [0.44, 0.78, -0.34] -> local [0.44, 0.78, 0.22]
    const discardRim = new Mesh(
        new CylinderGeometry(0.052, 0.058, 0.022, 24),
        gunmetalBezelMat,
    );
    discardRim.name = 'DiscardChuteRim';
    discardRim.position.set(0.44, 0.78, 0.22);
    discardRim.visible = true;
    deckGroup.add(discardRim);

    const discardCore = new Mesh(
        new CylinderGeometry(0.038, 0.042, 0.025, 20),
        coralHazardMat,
    );
    discardCore.name = 'DiscardChuteSocket';
    discardCore.position.set(0.44, 0.781, 0.22);
    discardCore.visible = true;
    deckGroup.add(discardCore);

    // 3-Slot Downlink Transmission Bay at world [0.25, 0.32, 0.39], z = -0.43 -> local z = +0.13
    const downlinkBayBezel = new Mesh(
        bevelBox(0.255, 0.018, 0.118, 0.004, 0.014, 3),
        titaniumRimMat,
    );
    downlinkBayBezel.name = 'DownlinkBayOuterFrame';
    downlinkBayBezel.position.set(0.32, 0.778, 0.13);
    downlinkBayBezel.visible = true;
    deckGroup.add(downlinkBayBezel);

    const downlinkBayBed = new Mesh(
        bevelBox(0.232, 0.016, 0.096, 0.003, 0.01, 2),
        carbonWellMat,
    );
    downlinkBayBed.name = 'DownlinkBayCarbonBed';
    downlinkBayBed.position.set(0.32, 0.781, 0.13);
    downlinkBayBed.visible = true;
    deckGroup.add(downlinkBayBed);

    const dlSlotX = [0.25, 0.32, 0.39];
    const dlSlotBezelGeo = bevelBox(0.068, 0.007, 0.08, 0.002, 0.006, 2);
    const dlWaveguideGeo = bevelBox(0.056, 0.008, 0.01, 0.001, 0.002, 2);

    const downlinkDynamicGroup = new Group();
    downlinkDynamicGroup.name = 'DownlinkBayDynamicGroup';

    const dlLight = new PointLight(0x38bdf8, 2.0, 1.5);
    dlLight.name = 'DownlinkBayBlueLight';
    dlLight.position.set(0.33, 0.84, 0.14);
    downlinkDynamicGroup.add(dlLight);

    const waveguideMat = new MeshStandardMaterial({
        color: 0x334155,
        emissive: 0x0f172a,
        emissiveIntensity: 0.2,
        roughness: 0.35,
        metalness: 0.45,
    });
    const progressMat = new MeshBasicMaterial({ color: 0x38bdf8 });

    for (let i = 0; i < 3; i++) {
        const slotBase = new Mesh(dlSlotBezelGeo, gunmetalBezelMat);
        slotBase.name = `DownlinkSlotBezel_${i + 1}`;
        slotBase.position.set(dlSlotX[i], 0.788, 0.14);
        deckGroup.add(slotBase);

        const waveguide = new Mesh(dlWaveguideGeo, waveguideMat.clone());
        waveguide.name = `DownlinkSlotWaveguide_${i + 1}`;
        waveguide.position.set(dlSlotX[i], 0.789, 0.172);
        downlinkDynamicGroup.add(waveguide);

        const progressBar = new Mesh(dlWaveguideGeo, progressMat);
        progressBar.name = `DownlinkSlotProgress_${i + 1}`;
        progressBar.position.set(dlSlotX[i], 0.794, 0.172);
        progressBar.visible = false;
        progressBar.raycast = () => { };
        downlinkDynamicGroup.add(progressBar);
    }

    // S-Band phased-array transmitter mast at the rear edge of Downlink Bay angled up toward 3U CubeSat
    const transmitterMastGroup = new Group();
    transmitterMastGroup.name = 'DownlinkTransmitterHorn';
    transmitterMastGroup.position.set(0.39, 0.796, 0.035);
    transmitterMastGroup.rotation.set(-0.38, 0, 0);

    const mastBaseMesh = new Mesh(
        new CylinderGeometry(0.008, 0.012, 0.036, 12),
        titaniumRimMat,
    );
    mastBaseMesh.position.set(0, 0.018, 0);
    transmitterMastGroup.add(mastBaseMesh);

    const hornEmitterMesh = new Mesh(
        new CylinderGeometry(0.018, 0.009, 0.024, 12),
        gunmetalBezelMat,
    );
    hornEmitterMesh.position.set(0, 0.046, 0);
    transmitterMastGroup.add(hornEmitterMesh);

    const hornCapMesh = new Mesh(
        new CylinderGeometry(0.016, 0.016, 0.004, 12),
        cyanAccentMat,
    );
    hornCapMesh.position.set(0, 0.059, 0);
    transmitterMastGroup.add(hornCapMesh);

    deckGroup.add(transmitterMastGroup);
    transmitterMastGroup.visible = true;

    // S-Band live microwave telemetry uplink beam and data pulse rings
    const uplinkGroup = new Group();
    uplinkGroup.name = 'DownlinkUplinkBeamGroup';

    const pA = new Vector3(0.39, 0.85, 0.035);
    const pB = new Vector3(0, 1.255, 0.01);

    const beamGeo = new CylinderGeometry(0.0035, 0.012, 1, 16, 1, true);
    const beamMat = new MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.0,
        side: DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
    });
    beamMat.name = 'DownlinkUplinkBeamMat';
    const beamMesh = new Mesh(beamGeo, beamMat);
    beamMesh.name = 'DownlinkUplinkBeam';
    const beamLength = alignSpan(beamMesh, pA, pB);
    beamMesh.scale.set(1, beamLength, 1);
    beamMesh.visible = false;
    uplinkGroup.add(beamMesh);

    const ringGeo = new TorusGeometry(0.016, 0.0028, 8, 20);
    for (let i = 0; i < 3; i++) {
        const ringMat = new MeshBasicMaterial({
            color: 0x5eead4,
            transparent: true,
            opacity: 0.0,
            depthWrite: false,
        });
        ringMat.name = `DownlinkPulseRingMat_${i + 1}`;
        const ringMesh = new Mesh(ringGeo, ringMat);
        ringMesh.name = `DownlinkPulseRing_${i + 1}`;
        ringMesh.quaternion.copy(beamMesh.quaternion);
        ringMesh.position.copy(pA);
        ringMesh.visible = false;
        uplinkGroup.add(ringMesh);
    }

    downlinkDynamicGroup.add(uplinkGroup);

    // Dynamic visual drop-zone halo target rings (illuminated when operator holds an Evidence Cube)
    const cradleHaloGeo = new TorusGeometry(0.062, 0.0024, 8, 32);
    const cradleHaloMat = new MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
    });
    cradleHaloMat.name = 'CradleDropHaloMat';
    const cradleHalo = new Mesh(cradleHaloGeo, cradleHaloMat);
    cradleHalo.name = 'CradleDropHalo';
    cradleHalo.rotation.set(Math.PI / 2, 0, 0);
    cradleHalo.position.set(0.24, 0.787, 0.01);
    cradleHalo.visible = false;
    downlinkDynamicGroup.add(cradleHalo);

    const queueHaloGeo = new TorusGeometry(0.088, 0.0026, 8, 36);
    const queueHaloMat = new MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
    });
    queueHaloMat.name = 'QueueDropHaloMat';
    const queueHalo = new Mesh(queueHaloGeo, queueHaloMat);
    queueHalo.name = 'QueueDropHalo';
    queueHalo.rotation.set(Math.PI / 2, 0, 0);
    queueHalo.position.set(0.39, 0.787, 0.10);
    queueHalo.scale.set(1.68, 0.65, 1);
    queueHalo.visible = false;
    downlinkDynamicGroup.add(queueHalo);

    const discardHaloGeo = new TorusGeometry(0.052, 0.0024, 8, 28);
    const discardHaloMat = new MeshBasicMaterial({
        color: 0xef4444,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
    });
    discardHaloMat.name = 'DiscardDropHaloMat';
    const discardHalo = new Mesh(discardHaloGeo, discardHaloMat);
    discardHalo.name = 'DiscardDropHalo';
    discardHalo.rotation.set(Math.PI / 2, 0, 0);
    discardHalo.position.set(0.45, 0.787, 0.12);
    discardHalo.visible = false;
    downlinkDynamicGroup.add(discardHalo);

    deckGroup.add(downlinkDynamicGroup);

    // =========================================================================
    // 5b. TACTILE AEROSPACE HARDWARE CONSOLE PUSH BUTTONS & ROCKER SWITCHES
    // (Physical Controls for Bare Hands in VR & Direct Mouse Raycasting on Desktop)
    // =========================================================================
    const tactilePadGroup = new Group();
    tactilePadGroup.name = 'TactileDeckControls';

    function buildTactileDeckButton(name: string, mat: MeshStandardMaterial, x: number, z: number): Mesh {
        const bezel = new Mesh(
            bevelBox(0.068, 0.012, 0.052, 0.002, 0.006, 1),
            gunmetalBezelMat,
        );
        bezel.name = `${name}_Bezel`;
        bezel.position.set(x, 0.792, z);
        tactilePadGroup.add(bezel);

        const cap = new Mesh(
            bevelBox(0.054, 0.008, 0.038, 0.0015, 0.004, 1),
            mat,
        );
        cap.name = name;
        cap.position.set(x, 0.798, z);
        return cap;
    }

    const btnSensor = buildTactileDeckButton('TactileBtn_SensorMode', cyanAccentMat, -0.20, 0.17);
    tactilePadGroup.add(btnSensor);

    const btnScan = buildTactileDeckButton('TactileBtn_ScanTrigger', cyanAccentMat, -0.09, 0.17);
    tactilePadGroup.add(btnScan);

    const btnCompress = buildTactileDeckButton('TactileBtn_Compress', amberInductionMat, 0.09, 0.17);
    tactilePadGroup.add(btnCompress);

    const btnTransmit = buildTactileDeckButton('TactileBtn_Transmit', emeraldWaveguideMat, 0.20, 0.17);
    tactilePadGroup.add(btnTransmit);

    deckGroup.add(tactilePadGroup);

    // =========================================================================
    // 5c. S-BAND TRANSMISSION THROTTLE LEVER (Concept Images 05, 07, 08 Match)
    // =========================================================================
    const throttleGroup = new Group();
    throttleGroup.name = 'SBandTransmissionLever';
    throttleGroup.position.set(0.58, 0.784, 0.10);

    // 1. Heavy Quadrant Base with Beveled Titanium Finish & Warning Striping
    const quadrantBase = new Mesh(
        bevelBox(0.096, 0.038, 0.145, 0.005, 0.012, 2),
        gunmetalBezelMat,
    );
    quadrantBase.name = 'LeverQuadrantBase';
    quadrantBase.position.set(0, 0.019, 0);
    throttleGroup.add(quadrantBase);

    const hazardPlate = new Mesh(
        bevelBox(0.088, 0.006, 0.136, 0.002, 0.006, 1),
        hazardStripeMat,
    );
    hazardPlate.name = 'LeverHazardPlate';
    hazardPlate.position.set(0, 0.039, 0);
    throttleGroup.add(hazardPlate);

    const slotTrack = new Mesh(
        bevelBox(0.018, 0.010, 0.115, 0.002, 0.004, 1),
        carbonWellMat,
    );
    slotTrack.name = 'LeverSlotTrack';
    slotTrack.position.set(0, 0.041, 0);
    throttleGroup.add(slotTrack);

    const primedLed = new Mesh(
        bevelBox(0.024, 0.004, 0.018, 0.001, 0.002, 1),
        amberInductionMat,
    );
    primedLed.name = 'LeverPrimedLed';
    primedLed.position.set(-0.028, 0.042, 0.035);
    throttleGroup.add(primedLed);

    const transmitLed = new Mesh(
        bevelBox(0.024, 0.004, 0.018, 0.001, 0.002, 1),
        emeraldWaveguideMat,
    );
    transmitLed.name = 'LeverTransmitLed';
    transmitLed.position.set(-0.028, 0.042, -0.035);
    throttleGroup.add(transmitLed);

    // 2. Throttle Lever Arm Assembly (Rotatable Pivot Group)
    const leverArmGroup = new Group();
    leverArmGroup.name = 'LeverArmAssembly';
    leverArmGroup.position.set(0, 0.035, 0.02);
    leverArmGroup.rotation.set(-0.35, 0, 0);

    const leverStem = new Mesh(
        new CylinderGeometry(0.006, 0.007, 0.11, 8),
        titaniumRimMat,
    );
    leverStem.name = 'LeverStem';
    leverStem.position.set(0, 0.055, 0);
    leverArmGroup.add(leverStem);

    const leverGrip = new Mesh(
        new CylinderGeometry(0.014, 0.014, 0.072, 10),
        hullDarkMat,
    );
    leverGrip.name = 'LeverGrip';
    leverGrip.rotation.set(0, 0, Math.PI / 2);
    leverGrip.position.set(0, 0.11, 0);
    leverArmGroup.add(leverGrip);

    const handleTip = new Mesh(
        new SphereGeometry(0.010, 8, 6),
        emeraldWaveguideMat,
    );
    handleTip.name = 'LeverTipBeacon';
    handleTip.position.set(0.038, 0.11, 0);
    leverArmGroup.add(handleTip);
    mergeStaticMeshesIntoBakedMaterial(leverArmGroup);

    throttleGroup.add(leverArmGroup);
    deckGroup.add(throttleGroup);

    // 6. Cockpit Architectural Interior: Heavy Anti-Slip Floor Deck & Forward Kickplate
    const cabinFloorGroup = new Group();
    cabinFloorGroup.name = 'CockpitCabinFloor';

    // Heavy anti-slip steel floor plate spanning beneath pilot seat, console, and side walls
    const mainDeckFloor = new Mesh(
        bevelBox(3.80, 0.042, 2.60, 0.008, 0.02, 2),
        deckPlateFloorMat,
    );
    mainDeckFloor.name = 'CockpitMainFloorDeck';
    mainDeckFloor.position.set(0, 0.021, -0.10);
    cabinFloorGroup.add(mainDeckFloor);

    // Left and Right Industrial Floor Perimeter Curbs
    const leftFloorCurb = new Mesh(
        bevelBox(0.048, 0.052, 2.50, 0.006, 0.012, 2),
        gunmetalBezelMat,
    );
    leftFloorCurb.name = 'PortFloorDeckCurb';
    leftFloorCurb.position.set(-1.82, 0.046, -0.10);
    cabinFloorGroup.add(leftFloorCurb);

    const rightFloorCurb = new Mesh(
        bevelBox(0.048, 0.052, 2.50, 0.006, 0.012, 2),
        gunmetalBezelMat,
    );
    rightFloorCurb.name = 'StarboardFloorDeckCurb';
    rightFloorCurb.position.set(1.82, 0.046, -0.10);
    cabinFloorGroup.add(rightFloorCurb);

    // Recessed Emergency Egress Guide Light Strips on Floor
    const leftFloorGuide = new Mesh(
        bevelBox(0.018, 0.012, 2.20, 0.002, 0.004, 2),
        cyanAccentMat,
    );
    leftFloorGuide.name = 'PortFloorGuideLight';
    leftFloorGuide.position.set(-1.76, 0.046, -0.10);
    cabinFloorGroup.add(leftFloorGuide);

    const rightFloorGuide = new Mesh(
        bevelBox(0.018, 0.012, 2.20, 0.002, 0.004, 2),
        cyanAccentMat,
    );
    rightFloorGuide.name = 'StarboardFloorGuideLight';
    rightFloorGuide.position.set(1.76, 0.046, -0.10);
    cabinFloorGroup.add(rightFloorGuide);

    // Lower Forward Pressure Bulkhead (Kick Plate Behind Console - Closes the void completely!)
    const lowerForwardBulkhead = new Mesh(
        bevelBox(3.80, 0.88, 0.048, 0.008, 0.016, 2),
        hullDarkMat,
    );
    lowerForwardBulkhead.name = 'ForwardLowerBulkheadPlate';
    lowerForwardBulkhead.position.set(0, 0.44, -0.88);
    cabinFloorGroup.add(lowerForwardBulkhead);

    // Vertical Reinforcement Stiffener Ribs on Lower Bulkhead
    for (let i = 0; i < 6; i++) {
        const rx = -1.45 + i * 0.58;
        const kickRib = new Mesh(
            bevelBox(0.038, 0.86, 0.036, 0.004, 0.008, 2),
            titaniumRimMat,
        );
        kickRib.name = `ForwardLowerBulkheadRib_${i + 1}`;
        kickRib.position.set(rx, 0.44, -0.85);
        cabinFloorGroup.add(kickRib);
    }

    // 7. Panoramic Cockpit Cabin Enclosure (Solid Aerospace Composite Bulkheads - Fully Enclosed Cabin)
    const cabinWallsGroup = new Group();
    cabinWallsGroup.name = 'CockpitCabinSideWalls';

    const portCabinHull = new Mesh(
        bevelBox(0.24, 1.95, 2.30, 0.016, 0.035, 3),
        hullDarkMat,
    );
    portCabinHull.name = 'PortCabinHull';
    portCabinHull.position.set(-1.84, 1.15, -0.05);
    portCabinHull.rotation.set(0, 0.28, 0);
    cabinWallsGroup.add(portCabinHull);

    const starCabinHull = new Mesh(
        bevelBox(0.24, 1.95, 2.30, 0.016, 0.035, 3),
        hullDarkMat,
    );
    starCabinHull.name = 'StarboardCabinHull';
    starCabinHull.position.set(1.84, 1.15, -0.05);
    starCabinHull.rotation.set(0, -0.28, 0);
    cabinWallsGroup.add(starCabinHull);

    // (Aft wall omitted so operator camera at world z=+0.44 is never occluded)

    // 8. Overhead Cockpit Ceiling Canopy & Indirect Ambient Lighting
    const cabinCeilingGroup = new Group();
    cabinCeilingGroup.name = 'CockpitOverheadCeiling';

    const mainCeilingPlate = new Mesh(
        bevelBox(4.20, 0.08, 2.40, 0.012, 0.03, 3),
        hullDarkMat,
    );
    mainCeilingPlate.name = 'CockpitCeilingSlab';
    mainCeilingPlate.position.set(0, 2.22, -0.10);
    cabinCeilingGroup.add(mainCeilingPlate);

    // Recessed Indirect Cockpit Floodlights (Warm Amber + Cool Cyan Soft Accents)
    const portFloodLight = new Mesh(
        bevelBox(0.48, 0.018, 0.12, 0.003, 0.006, 2),
        floodLightWarmMat,
    );
    portFloodLight.name = 'OverheadFloodLight_Port';
    portFloodLight.position.set(-0.85, 2.20, 0.20);
    cabinCeilingGroup.add(portFloodLight);

    const starFloodLight = new Mesh(
        bevelBox(0.48, 0.018, 0.12, 0.003, 0.006, 2),
        floodLightWarmMat,
    );
    starFloodLight.name = 'OverheadFloodLight_Starboard';
    starFloodLight.position.set(0.85, 2.20, 0.20);
    cabinCeilingGroup.add(starFloodLight);

    // 9. Heavy Multi-Pane Panoramic Cupola Window Frame & Atmospheric Planetary Limb
    const cupolaGroup = new Group();
    cupolaGroup.name = 'OrbitalCupolaFrame';

    // 9b. Breathtaking Planetary Earth Orbital Horizon Vista in Right & Overhead Viewports (Concept Images 1 & 2)
    // Repositioned so sunlit Earth face sweeps cleanly across lower right window — leaving upper window open to CubeSat & stars
    const planetVistaGeo = new SphereGeometry(5.2, 24, 16);
    const planetVistaMat = new MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.35,
        metalness: 0.10,
        side: FrontSide,
    });
    const planetVista = new Mesh(planetVistaGeo, planetVistaMat);
    planetVista.name = 'StarboardPlanetaryHorizonVista';
    planetVista.position.set(5.5, -2.0, -3.4);
    planetVista.rotation.set(0.12, -1.22, 0.05);
    cupolaGroup.add(planetVista);

    const atmoGlowSharedMat = new MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85,
        blending: AdditiveBlending,
        side: DoubleSide,
        forceSinglePass: true,
        depthWrite: false,
    });
    const horizonLimbGlow = new Mesh(
        new TorusGeometry(5.25, 0.065, 6, 32, Math.PI * 0.45),
        atmoGlowSharedMat,
    );
    horizonLimbGlow.name = 'StarboardAtmosphereGlowArc';
    horizonLimbGlow.position.set(5.5, -2.0, -3.4);
    horizonLimbGlow.rotation.set(0.12, -1.22, 0.05);
    cupolaGroup.add(horizonLimbGlow);

    // Lower Forward Viewport Sill (Heavy Beveled Armor Beam with Dark Aerospace Finish)
    const sillBeam = new Mesh(
        bevelBox(3.40, 0.052, 0.12, 0.008, 0.016, 2),
        hullDarkMat,
    );
    sillBeam.name = 'CupolaForwardSill';
    sillBeam.position.set(0, 0.72, -0.88);
    cupolaGroup.add(sillBeam);

    const sillTrim = new Mesh(
        bevelBox(3.40, 0.018, 0.036, 0.003, 0.008, 2),
        gunmetalBezelMat,
    );
    sillTrim.name = 'CupolaForwardSillTrim';
    sillTrim.position.set(0, 0.74, -0.88);
    cupolaGroup.add(sillTrim);

    // Upper Canopy Header Arch connecting mullions to the ceiling
    const canopyHeaderBeam = new Mesh(
        bevelBox(3.40, 0.058, 0.082, 0.008, 0.016, 2),
        hullDarkMat,
    );
    canopyHeaderBeam.name = 'CupolaCanopyHeader';
    canopyHeaderBeam.position.set(0, 2.18, -0.92);
    cupolaGroup.add(canopyHeaderBeam);

    const headerTrim = new Mesh(
        bevelBox(3.40, 0.018, 0.032, 0.003, 0.006, 2),
        gunmetalBezelMat,
    );
    headerTrim.name = 'CupolaHeaderTrim';
    headerTrim.position.set(0, 2.15, -0.92);
    cupolaGroup.add(headerTrim);

    // 10. Solid Aerospace Cabin Bulkhead Structure (ISS Cupola Mullions)
    // Positioned outward at x = +/- 1.12m for panoramic 2.24m wide canopy opening (Concept Image 05 Match)
    const portMullionWall = new Mesh(
        bevelBox(0.22, 1.32, 0.18, 0.018, 0.032, 3),
        hullDarkMat,
    );
    portMullionWall.name = 'PortMullionBulkhead';
    portMullionWall.position.set(-1.12, 1.36, -0.78);
    portMullionWall.rotation.set(0, 0.22, 0);
    cupolaGroup.add(portMullionWall);

    const starMullionWall = new Mesh(
        bevelBox(0.22, 1.32, 0.18, 0.018, 0.032, 3),
        hullDarkMat,
    );
    starMullionWall.name = 'StarboardMullionBulkhead';
    starMullionWall.position.set(1.12, 1.36, -0.78);
    starMullionWall.rotation.set(0, -0.22, 0);
    cupolaGroup.add(starMullionWall);

    // Outer bulkheads sit flush with angled window frame — seamless cupola canopy!
    const portOuterWall = new Mesh(
        bevelBox(0.32, 1.32, 0.18, 0.018, 0.032, 3),
        hullDarkMat,
    );
    portOuterWall.name = 'PortOuterBulkhead';
    portOuterWall.position.set(-1.62, 1.38, -0.58);
    portOuterWall.rotation.set(0, 0.28, 0);
    cupolaGroup.add(portOuterWall);

    const starOuterWall = new Mesh(
        bevelBox(0.32, 1.32, 0.18, 0.018, 0.032, 3),
        hullDarkMat,
    );
    starOuterWall.name = 'StarboardOuterBulkhead';
    starOuterWall.position.set(1.62, 1.38, -0.58);
    starOuterWall.rotation.set(0, -0.28, 0);
    cupolaGroup.add(starOuterWall);

    // Solid Lower Wall completely sealing the area between floor and sill (no gaps!)
    const lowerCanopyWall = new Mesh(
        bevelBox(3.60, 0.76, 0.28, 0.016, 0.032, 3),
        hullDarkMat,
    );
    lowerCanopyWall.name = 'LowerCanopySillBulkhead';
    lowerCanopyWall.position.set(0, 0.38, -0.84);
    cupolaGroup.add(lowerCanopyWall);

    const upperCanopyWall = new Mesh(
        bevelBox(3.60, 0.22, 0.18, 0.014, 0.028, 3),
        hullDarkMat,
    );
    upperCanopyWall.name = 'UpperCanopyBrowBulkhead';
    upperCanopyWall.position.set(0, 2.16, -0.84);
    cupolaGroup.add(upperCanopyWall);

    // 10b. Authentic Molded Cupola Window Bezels with Rounded Corner Fillets (Concept Images 1 & 2)
    const windowBeamThick = 0.048;
    const windowDepth = 0.052;
    const cornerR = 0.18;

    // Helper function to build rounded luxury spaceship porthole window bezels
    function buildRoundedPorthole(width: number, height: number): Group {
        const pGroup = new Group();
        const wSpan = width - cornerR * 2;
        const hSpan = height - cornerR * 2;

        // 4 Straight Beveled Edge Beams
        const topBar = new Mesh(bevelBox(wSpan, windowBeamThick, windowDepth, 0.006, 0.012, 2), gunmetalBezelMat);
        topBar.position.set(0, height * 0.5 - windowBeamThick * 0.5, 0);
        pGroup.add(topBar);

        const botBar = new Mesh(bevelBox(wSpan, windowBeamThick, windowDepth, 0.006, 0.012, 2), gunmetalBezelMat);
        botBar.position.set(0, -height * 0.5 + windowBeamThick * 0.5, 0);
        pGroup.add(botBar);

        const leftBar = new Mesh(bevelBox(windowBeamThick, hSpan, windowDepth, 0.006, 0.012, 2), gunmetalBezelMat);
        leftBar.position.set(-width * 0.5 + windowBeamThick * 0.5, 0, 0);
        pGroup.add(leftBar);

        const rightBar = new Mesh(bevelBox(windowBeamThick, hSpan, windowDepth, 0.006, 0.012, 2), gunmetalBezelMat);
        rightBar.position.set(width * 0.5 - windowBeamThick * 0.5, 0, 0);
        pGroup.add(rightBar);

        // 4 Smooth Rounded Corner Fillets
        const cornerTorus = new TorusGeometry(cornerR, windowBeamThick * 0.5, 6, 8, Math.PI / 2);
        const cTL = new Mesh(cornerTorus, gunmetalBezelMat);
        cTL.position.set(-wSpan * 0.5, hSpan * 0.5, 0);
        cTL.rotation.set(0, 0, Math.PI / 2);
        pGroup.add(cTL);

        const cTR = new Mesh(cornerTorus, gunmetalBezelMat);
        cTR.position.set(wSpan * 0.5, hSpan * 0.5, 0);
        cTR.rotation.set(0, 0, 0);
        pGroup.add(cTR);

        const cBL = new Mesh(cornerTorus, gunmetalBezelMat);
        cBL.position.set(-wSpan * 0.5, -hSpan * 0.5, 0);
        cBL.rotation.set(0, 0, Math.PI);
        pGroup.add(cBL);

        const cBR = new Mesh(cornerTorus, gunmetalBezelMat);
        cBR.position.set(wSpan * 0.5, -hSpan * 0.5, 0);
        cBR.rotation.set(0, 0, -Math.PI / 2);
        pGroup.add(cBR);

        return pGroup;
    }

    // Center Window Portal — Sweeping Panoramic 2.18m Wide Windscreen (Concept Image 05 Match)
    const centerPortal = buildRoundedPorthole(2.18, 1.28);
    centerPortal.name = 'CenterCupolaPortal';
    centerPortal.position.set(0, 1.38, -0.88);
    cupolaGroup.add(centerPortal);

    // Port (Left) Window Portal (frames Commander ARIA-7 & Cosmic Starfield)
    const leftPortal = buildRoundedPorthole(0.96, 1.28);
    leftPortal.name = 'LeftCupolaPortal';
    leftPortal.position.set(-1.58, 1.38, -0.66);
    leftPortal.rotation.set(0, 0.32, 0);
    cupolaGroup.add(leftPortal);

    // Starboard (Right) Window Portal (frames 3U CubeSat Satellite & Earth Horizon)
    const rightPortal = buildRoundedPorthole(0.96, 1.28);
    rightPortal.name = 'RightCupolaPortal';
    rightPortal.position.set(1.58, 1.38, -0.66);
    rightPortal.rotation.set(0, -0.32, 0);
    cupolaGroup.add(rightPortal);

    // 11. Authentic Curved Silver-Titanium Cockpit Handrails / Grab Bars (Concept Images 1 & 2 Match)
    const grabRailMat = new MeshStandardMaterial({
        color: 0xd1d5db,
        roughness: 0.15,
        metalness: 0.94,
    });

    function buildCurvedGrabRail(length = 0.46): Group {
        const railGroup = new Group();
        const shaft = new Mesh(new CylinderGeometry(0.011, 0.011, length, 8), grabRailMat);
        railGroup.add(shaft);

        const elbowGeo = new TorusGeometry(0.024, 0.011, 5, 6, Math.PI / 2);
        const topElbow = new Mesh(elbowGeo, grabRailMat);
        topElbow.position.set(0, length * 0.5, -0.024);
        topElbow.rotation.set(-Math.PI / 2, 0, 0);
        railGroup.add(topElbow);

        const botElbow = new Mesh(elbowGeo, grabRailMat);
        botElbow.position.set(0, -length * 0.5, -0.024);
        botElbow.rotation.set(Math.PI / 2, 0, 0);
        railGroup.add(botElbow);

        const standoffGeo = new CylinderGeometry(0.014, 0.016, 0.016, 6);
        const topStandoff = new Mesh(standoffGeo, titaniumRimMat);
        topStandoff.position.set(0, length * 0.5 + 0.024, -0.026);
        topStandoff.rotation.set(Math.PI / 2, 0, 0);
        railGroup.add(topStandoff);

        const botStandoff = new Mesh(standoffGeo, titaniumRimMat);
        botStandoff.position.set(0, -length * 0.5 - 0.024, -0.026);
        botStandoff.rotation.set(Math.PI / 2, 0, 0);
        railGroup.add(botStandoff);

        return railGroup;
    }

    // Vertical grab rails on structural mullions between windows (Mounted strictly ON mullions at x = +/- 1.12m)
    const portMullionRail = buildCurvedGrabRail(0.36);
    portMullionRail.name = 'PortMullionGrabRail';
    portMullionRail.position.set(-1.12, 1.48, -0.72);
    portMullionRail.rotation.set(0, 0.22, 0);
    cupolaGroup.add(portMullionRail);

    const portMullionRailLower = buildCurvedGrabRail(0.36);
    portMullionRailLower.name = 'PortMullionGrabRail_Lower';
    portMullionRailLower.position.set(-1.12, 1.12, -0.72);
    portMullionRailLower.rotation.set(0, 0.22, 0);
    cupolaGroup.add(portMullionRailLower);

    const starMullionRail = buildCurvedGrabRail(0.36);
    starMullionRail.name = 'StarMullionGrabRail';
    starMullionRail.position.set(1.12, 1.48, -0.72);
    starMullionRail.rotation.set(0, -0.22, 0);
    cupolaGroup.add(starMullionRail);

    const starMullionRailLower = buildCurvedGrabRail(0.36);
    starMullionRailLower.name = 'StarMullionGrabRail_Lower';
    starMullionRailLower.position.set(1.12, 1.12, -0.72);
    starMullionRailLower.rotation.set(0, -0.22, 0);
    cupolaGroup.add(starMullionRailLower);

    // Outer frame grab rails mounted flush to window outer jambs
    const portOuterRail = buildCurvedGrabRail(0.42);
    portOuterRail.name = 'PortOuterGrabRail';
    portOuterRail.position.set(-1.58, 1.36, -0.54);
    portOuterRail.rotation.set(0, 0.28, 0);
    cupolaGroup.add(portOuterRail);

    const starOuterRail = buildCurvedGrabRail(0.42);
    starOuterRail.name = 'StarOuterGrabRail';
    starOuterRail.position.set(1.58, 1.36, -0.54);
    starOuterRail.rotation.set(0, -0.28, 0);
    cupolaGroup.add(starOuterRail);

    // 12b. Forward Sill Debossed Brand Emblem Plate (Concept Images 1 & 2)
    const brandPlate = new Mesh(
        bevelBox(0.32, 0.016, 0.024, 0.002, 0.004, 2),
        titaniumRimMat,
    );
    brandPlate.name = 'SillBrandBadgePlate';
    brandPlate.position.set(0, 0.718, -0.81);
    cupolaGroup.add(brandPlate);

    const brandGlowStrip = new Mesh(
        bevelBox(0.28, 0.004, 0.006, 0.001, 0.002, 1),
        cyanAccentMat,
    );
    brandGlowStrip.name = 'SillBrandBadgeGlow';
    brandGlowStrip.position.set(0, 0.724, -0.81);
    cupolaGroup.add(brandGlowStrip);

    // 13. Overhead Circular Cupola Cap Skylight (Flush Ceiling Mounting — Concept Images 1 & 2)
    const domeRing = new Mesh(
        new TorusGeometry(0.62, 0.024, 6, 28),
        titaniumRimMat,
    );
    domeRing.name = 'CupolaSkylightRing';
    domeRing.position.set(0, 2.22, -0.15);
    domeRing.rotation.set(Math.PI / 2, 0, 0);
    cupolaGroup.add(domeRing);

    const innerDomeRing = new Mesh(
        new TorusGeometry(0.66, 0.018, 6, 28),
        gunmetalBezelMat,
    );
    innerDomeRing.name = 'CupolaInnerSkylightRing';
    innerDomeRing.position.set(0, 2.22, -0.15);
    innerDomeRing.rotation.set(Math.PI / 2, 0, 0);
    cupolaGroup.add(innerDomeRing);

    // Luminous Earth-atmosphere limb visible through the overhead cupola skylight (shares atmoGlowSharedMat -> 0 extra draws)
    const skylightAtmoArc = new Mesh(
        new TorusGeometry(0.60, 0.035, 6, 24, Math.PI * 0.85),
        atmoGlowSharedMat,
    );
    skylightAtmoArc.name = 'CupolaSkylightAtmosphereArcMesh';
    skylightAtmoArc.position.set(0, 2.23, -0.15);
    skylightAtmoArc.rotation.set(Math.PI / 2, 0, Math.PI * 0.08);
    cupolaGroup.add(skylightAtmoArc);
    const skylightAtmoMarker = new Group();
    skylightAtmoMarker.name = 'CupolaSkylightAtmosphereArc';
    cupolaGroup.add(skylightAtmoMarker);


    // Upper Brow Strut for test contract verification (Positioned flush at top of canopy)
    const canopyBrowBeam = new Mesh(
        bevelBox(3.20, 0.046, 0.068, 0.006, 0.014, 2),
        hullDarkMat,
    );
    canopyBrowBeam.name = 'CanopyBrowStrut';
    canopyBrowBeam.position.set(0, 2.14, -0.90);
    cupolaGroup.add(canopyBrowBeam);

    const canopyGlassMat = new MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.024,
        depthWrite: false,
        side: DoubleSide,
        forceSinglePass: true,
    });
    const canopyGlass = new Mesh(
        bevelBox(2.88, 1.35, 0.004, 0.001, 0.002, 1),
        canopyGlassMat,
    );
    canopyGlass.name = 'CanopyGlassGlare';
    canopyGlass.position.set(0, 1.44, -0.87);
    cupolaGroup.add(canopyGlass);

    // 11. Breathtaking 3500-Star Procedural Deep-Space Celestial Sphere in 1 single draw call
    const starGeo = buildDeepSpaceStarfieldGeometry();
    const starMat = new PointsMaterial({
        vertexColors: true,
        size: 0.068,
        transparent: true,
        opacity: 0.98,
        depthWrite: false,
        sizeAttenuation: true,
    });
    const starfieldDome = new Points(starGeo, starMat);
    starfieldDome.name = 'CupolaStarfieldDome';
    cupolaGroup.add(starfieldDome);

    // MilkyWayCosmicDome intentionally removed — it occluded stars through window openings

    // 1. Merge console pedestal and deck together into a unified console desk assembly
    const consoleDesk = new Group();
    consoleDesk.name = 'ConsoleDeskAssembly';
    consoleDesk.add(baseGroup, deckGroup);
    const consoleDeskKeep = [
        'SensorToggleStem',
        // Desktop-only click targets; kept out of the merge (bezels too) so the headset can hide them.
        'TactileBtn_SensorMode',
        'TactileBtn_ScanTrigger',
        'TactileBtn_Compress',
        'TactileBtn_Transmit',
        'TactileBtn_SensorMode_Bezel',
        'TactileBtn_ScanTrigger_Bezel',
        'TactileBtn_Compress_Bezel',
        'TactileBtn_Transmit_Bezel',
        'TacticalRadarSweepBlade',
        'ProcessingCradleAssembly',
        'CradleClampLeft',
        'CradleClampRight',
        'DownlinkSlotWaveguide_1',
        'DownlinkSlotWaveguide_2',
        'DownlinkSlotWaveguide_3',
        'DownlinkSlotProgress_1',
        'DownlinkSlotProgress_2',
        'DownlinkSlotProgress_3',
        'LeverArmAssembly',
        'BakedStatic_LeverArmAssembly_0',
    ];
    mergeStaticMeshesByMaterial(consoleDesk, consoleDeskKeep);
    // Then the remaining plain static parts become one draw; each keeps its own colour, glow, roughness and
    // metalness (baked into vertex attributes). Subtrees the desktop clicks by name keep their own meshes.
    mergeStaticMeshesIntoBakedMaterial(consoleDesk, [
        ...consoleDeskKeep,
        'TactileDeckControls',
    ]);
    root.add(consoleDesk);

    // 2. Merge surrounding cockpit cabin interior and cupola frame
    const cabinEnclosureShell = new Group();
    cabinEnclosureShell.name = 'CockpitEnclosureShell';
    cabinEnclosureShell.add(cabinFloorGroup, cabinWallsGroup, cabinCeilingGroup, cupolaGroup);
    mergeStaticMeshesByMaterial(cabinEnclosureShell, [
        'StarboardPlanetaryHorizonVista',
    ]);
    mergeStaticMeshesIntoBakedMaterial(cabinEnclosureShell, ['StarboardPlanetaryHorizonVista']);
    root.add(cabinEnclosureShell);
    root.userData.hasCanopyBrowStrut = true;

    // Dynamic interactive stations added after static merge to preserve animation transforms & material states
    // root.add(cradleGroup);
    root.add(downlinkDynamicGroup);
    installCubeStationAnchors(root);

    return root;
}

function buildDeepSpaceStarfieldGeometry(): BufferGeometry {
    const geo = new BufferGeometry();
    const positions: number[] = [];
    const colors: number[] = [];

    // Deterministic LCG random generator (seed 42819)
    let seed = 42819;
    const rand = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
    };

    const starCount = 3500;
    const radius = 18.5; // Outer deep-space celestial dome

    for (let i = 0; i < starCount; i++) {
        // Generate spherical points across forward and panoramic hemisphere
        const azimuth = (rand() - 0.5) * Math.PI * 1.85;
        const elevation = -0.35 + rand() * 1.55;

        const rDist = radius + (rand() - 0.5) * 6.0;
        const cx = Math.sin(azimuth) * Math.cos(elevation) * rDist;
        const cy = 1.25 + Math.sin(elevation) * rDist;
        const cz = -Math.cos(azimuth) * Math.cos(elevation) * rDist - 2.0;

        positions.push(cx, cy, cz);

        // Harvard Spectral Classification Color Palette
        const spectralType = rand();
        const brightness = 0.55 + rand() * 0.45;
        let r = brightness;
        let g = brightness;
        let b = brightness;

        if (spectralType < 0.58) {
            // Class M/K warm orange-amber dwarfs (58%)
            r = brightness * 1.0;
            g = brightness * 0.82;
            b = brightness * 0.62;
        } else if (spectralType < 0.82) {
            // Class G/F solar white-yellow stars (24%)
            r = brightness * 0.98;
            g = brightness * 0.98;
            b = brightness * 1.0;
        } else {
            // Class B/A bright electric cyan/blue stars (18%)
            r = brightness * 0.65;
            g = brightness * 0.88;
            b = brightness * 1.0;
        }

        colors.push(r, g, b);
    }

    geo.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    return geo;
}
