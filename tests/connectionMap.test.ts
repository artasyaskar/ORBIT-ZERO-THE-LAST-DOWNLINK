import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Connection map: every button in the spatial UI (public/ui/*.uikitml) is wired to a handler in
 * MissionControlSystem, and every handler points at a button that exists. A renamed or deleted button
 * otherwise fails silently: bindClick() returns when getElementById finds nothing.
 */
const root = join(__dirname, '..');
const source = readFileSync(join(root, 'src', 'systems', 'missionControlSystem.ts'), 'utf8');
const PANEL_FILES: Record<string, string> = {
  briefingPanel: 'briefing-panel',
  telemetryPanel: 'telemetry-hud',
  debriefPanel: 'debrief-panel',
  missionHud: 'mission-hud',
};
/** Buttons wired outside bindClick, each with the reason. */
const WIRED_ELSEWHERE: Record<string, string> = {
  'briefing-panel:xr-button': 'addEventListener -> getXrEntryOverlay().enter()',
  'briefing-panel:exit-button': 'addEventListener -> world.exitXR()',
  'telemetry-hud:Btn_DominantHand': 'hidden on purpose: the scanner always rests in the left holster',
};

function buttonsByPanel(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const file of readdirSync(join(root, 'public', 'ui')).filter((f) => f.endsWith('.uikitml'))) {
    const markup = readFileSync(join(root, 'public', 'ui', file), 'utf8');
    const ids = [...markup.matchAll(/<Button\b[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    map.set(file.replace(/\.uikitml$/, ''), new Set(ids));
  }
  return map;
}

function boundButtons(): Array<{ panel: string; id: string }> {
  const bound = [...source.matchAll(/bindClick\(this\.(\w+),\s*'([^']+)'/g)].map((m) => ({ panel: PANEL_FILES[m[1]] ?? m[1], id: m[2] }));
  // Accessibility toggles are bound in a loop: bindClick(this.telemetryPanel, `Btn_${preferenceIds[key]}`, ...).
  const prefBlock = source.match(/const preferenceIds = \{([^}]*)\}/);
  expect(prefBlock, 'preferenceIds map not found').not.toBeNull();
  for (const m of prefBlock![1].matchAll(/\w+:\s*'([^']+)'/g)) bound.push({ panel: 'telemetry-hud', id: `Btn_${m[1]}` });
  return bound;
}

describe('Spatial UI connection map', () => {
  const buttons = buttonsByPanel();
  const bound = boundButtons();

  it('finds the four panels and their buttons', () => {
    expect([...buttons.keys()].sort()).toEqual(['briefing-panel', 'debrief-panel', 'mission-hud', 'telemetry-hud']);
    expect(bound.length).toBeGreaterThan(25);
  });

  it('every handler targets a button that exists in its panel', () => {
    const dangling = bound.filter(({ panel, id }) => !buttons.get(panel)?.has(id)).map(({ panel, id }) => `${panel}:${id}`);
    expect(dangling).toEqual([]);
  });

  it('every button has a handler (or a recorded reason)', () => {
    const boundKeys = new Set(bound.map(({ panel, id }) => `${panel}:${id}`));
    const orphans: string[] = [];
    for (const [panel, ids] of buttons) {
      for (const id of ids) {
        // Text labels inside buttons also carry ids (Lbl_*); only the Button elements need handlers.
        if (id.startsWith('Lbl_')) continue;
        const key = `${panel}:${id}`;
        if (!boundKeys.has(key) && !WIRED_ELSEWHERE[key]) orphans.push(key);
      }
    }
    expect(orphans).toEqual([]);
  });

  it('the buttons wired outside bindClick are really referenced', () => {
    for (const key of Object.keys(WIRED_ELSEWHERE)) {
      const id = key.split(':')[1];
      expect(source.includes(`getElementById('${id}')`), key).toBe(true);
    }
  });

  it('the removed MR tabletop toggle stays removed', () => {
    expect(buttons.get('telemetry-hud')?.has('Btn_TabletopMode')).toBe(false);
    expect(source).not.toMatch(/immersive-ar|SessionMode\.ImmersiveAR/);
  });
});
