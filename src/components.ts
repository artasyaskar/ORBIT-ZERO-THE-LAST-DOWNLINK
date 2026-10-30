/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * ECS Components for spatial orbital triage interactions.
 */

import { createComponent, defineComponents, Types } from '@iwsdk/core';

export const OrbitSectorNode = createComponent('OrbitSectorNode', {
  sectorId: { type: Types.String, default: 'B' },
});

export const EvidenceCubeNode = createComponent('EvidenceCubeNode', {
  slotIndex: { type: Types.Int8, default: 0 },
  packetId: { type: Types.String, default: '' },
});

export const ConsoleControlNode = createComponent('ConsoleControlNode', {
  action: { type: Types.String, default: 'SCAN' },
});

export default defineComponents([
  OrbitSectorNode,
  EvidenceCubeNode,
  ConsoleControlNode,
]);
