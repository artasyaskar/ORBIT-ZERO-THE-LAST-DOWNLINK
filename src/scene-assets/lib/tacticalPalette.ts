/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Tactical Gen-Z Aerospace Color Palette (RC10.0)
 * 
 * Replaces sterile blues/grays with high-contrast cyberpunk tactical aesthetic
 * optimized for Meta Quest 3 OLED displays and Gen-Z visual preferences.
 */

export const TACTICAL_PALETTE = {
  // Core UI & Interactive Elements
  voidObsidian: 0x06090E,      // Cockpit base, deep space background
  electricCyan: 0x00F0FF,       // Primary interactive (OPTICAL sensor, data cubes)
  tacticalAmber: 0xFFB800,      // Processing, warnings, compression state
  sarEmerald: 0x00FF66,         // SAR RADAR mode, confirmed evidence
  dangerCrimson: 0xFF2A54,      // Low power alerts, errors, critical warnings
  titaniumGray: 0x3A4552,       // Structural console elements, inactive states
  
  // Atmospheric & Environmental
  deepSpaceBlack: 0x000000,     // Pure void background
  starWhite: 0xFFFFFF,          // Starfield points
  milkyWayBlue: 0x2A3F5F,       // Galaxy band gradient
  earthOcean: 0x0A2342,         // Ocean base color
  earthLand: 0x2D4A3E,          // Land base color
  cloudWhite: 0xE8F0F2,         // Cloud layers
  
  // Mission-Specific
  stormPurple: 0x6A1B9A,        // Monsoon storm cells
  lightningYellow: 0xFFEB3B,    // Lightning flashes
  floodCyan: 0x00BCD4,          // Inundated areas
  laserGreen: 0x00FF88,         // 532nm downlink telemetry laser
  
  // Holographic UI
  holoCore: 0x00E5FF,           // ARIA-7 avatar core
  holoRing: 0x00FFC6,           // Audio-reactive waveform rings
  holoText: 0xB3FFFF,           // Subtitle text
  
  // Evidence Confidence States
  confirmedGreen: 0x00FF66,     // CONFIRMED evidence
  probableAmber: 0xFFB800,      // PROBABLE evidence  
  unverifiedRed: 0xFF4444,      // UNVERIFIED evidence
} as const;

export const TACTICAL_PALETTE_CSS = {
  voidObsidian: '#06090E',
  electricCyan: '#00F0FF',
  tacticalAmber: '#FFB800',
  sarEmerald: '#00FF66',
  dangerCrimson: '#FF2A54',
  titaniumGray: '#3A4552',
  holoCore: '#00E5FF',
  holoText: '#B3FFFF',
} as const;

/**
 * Material emission intensities for glow effects (without post-processing bloom)
 */
export const EMISSION_INTENSITIES = {
  subtle: 0.3,     // Console trim, inactive buttons
  moderate: 0.6,   // Active UI elements, sector beacons
  strong: 1.2,     // Data cubes, processing cradle
  intense: 2.0,    // Lightning, laser, critical alerts
} as const;
