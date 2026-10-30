import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE_BADGES,
  GROUND_REQUEST_ORDER,
  GROUND_REQUESTS,
  MISSION_BUDGET,
  MISSION_SCENARIOS,
  SECTOR_ORDER,
  SECTORS,
} from '../src/mission/missionConfig';
import { MissionEngine } from '../src/mission/missionEngine';
import type {
  ConfidenceLevel,
  GroundRequestId,
  MissionScenarioId,
  SectorId,
  SensorMode,
} from '../src/mission/types';

describe('ORBIT ZERO - MissionEngine Deterministic Triage Simulation', () => {
  describe('1. Initial State & Resource Budget Invariants', () => {
    it('1.1 initializes with verified starting budget (55 Power, 0/9 Storage, 10.0s Downlink)', () => {
      const engine = new MissionEngine();
      const state = engine.getState();

      expect(state.power).toBe(55);
      expect(state.maxPower).toBe(55);
      expect(state.storageUsed).toBe(0);
      expect(state.maxStorage).toBe(9);
      expect(state.downlinkWindowSec).toBe(10.0);
      expect(state.downlinkRemainingSec).toBe(10.0);
      expect(state.downlinkElapsedSec).toBe(0);
      expect(state.downlinkCommittedSec).toBe(0);
      expect(state.packets).toHaveLength(0);
      expect(state.queuePacketIds).toHaveLength(0);
      expect(state.phase).toBe('OPERATIONS');
      expect(state.debrief).toBeNull();
    });

    it('1.2 returns defensive deep clones from getState() so external mutation cannot corrupt internal state', () => {
      const engine = new MissionEngine();
      engine.scanSector('B', 'RADAR');
      const snapshot = engine.getState();
      snapshot.power = 0;
      snapshot.packets[0].storageCost = 999;
      snapshot.queuePacketIds.push('FAKE-PKT');

      const fresh = engine.getState();
      expect(fresh.power).toBe(41);
      expect(fresh.packets[0].storageCost).toBe(3);
      expect(fresh.queuePacketIds).toHaveLength(0);
    });

    it('1.3 configures 6 sectors (A-F) and 3 ground requests with ASCII-safe badges', () => {
      expect(SECTOR_ORDER).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
      expect(GROUND_REQUEST_ORDER).toEqual(['REQ_1', 'REQ_2', 'REQ_3']);
      expect(CONFIDENCE_BADGES.CONFIRMED).toBe('[OK] CONFIRMED');
      expect(CONFIDENCE_BADGES.PROBABLE).toBe('[?] PROBABLE');
      expect(CONFIDENCE_BADGES.UNVERIFIED).toBe('[X] UNVERIFIED');
      for (const secId of SECTOR_ORDER) {
        const sec = SECTORS[secId];
        expect(sec.outcomes.OPTICAL.confidenceBadge).not.toMatch(/[^\x20-\x7E]/);
        expect(sec.outcomes.RADAR.confidenceBadge).not.toMatch(/[^\x20-\x7E]/);
      }
    });
  });

  describe('2. Exhaustive Sector (A-F) x Sensor (OPTICAL / RADAR) Scan Matrix (12 Cases)', () => {
    const expectedMatrix: Array<{
      sectorId: SectorId;
      sensorMode: SensorMode;
      confidence: ConfidenceLevel;
      satisfiesRequestId: GroundRequestId | null;
      powerCost: number;
      storageCost: number;
      transmitSec: number;
    }> = [
      { sectorId: 'A', sensorMode: 'OPTICAL', confidence: 'CONFIRMED', satisfiesRequestId: null, powerCost: 8, storageCost: 3, transmitSec: 4.0 },
      { sectorId: 'A', sensorMode: 'RADAR', confidence: 'CONFIRMED', satisfiesRequestId: null, powerCost: 14, storageCost: 3, transmitSec: 4.5 },
      { sectorId: 'B', sensorMode: 'OPTICAL', confidence: 'UNVERIFIED', satisfiesRequestId: null, powerCost: 8, storageCost: 3, transmitSec: 4.0 },
      { sectorId: 'B', sensorMode: 'RADAR', confidence: 'CONFIRMED', satisfiesRequestId: 'REQ_1', powerCost: 14, storageCost: 3, transmitSec: 4.5 },
      { sectorId: 'C', sensorMode: 'OPTICAL', confidence: 'CONFIRMED', satisfiesRequestId: 'REQ_2', powerCost: 8, storageCost: 3, transmitSec: 4.0 },
      { sectorId: 'C', sensorMode: 'RADAR', confidence: 'PROBABLE', satisfiesRequestId: 'REQ_2', powerCost: 14, storageCost: 3, transmitSec: 4.5 },
      { sectorId: 'D', sensorMode: 'OPTICAL', confidence: 'CONFIRMED', satisfiesRequestId: null, powerCost: 8, storageCost: 3, transmitSec: 4.0 },
      { sectorId: 'D', sensorMode: 'RADAR', confidence: 'PROBABLE', satisfiesRequestId: null, powerCost: 14, storageCost: 3, transmitSec: 4.5 },
      { sectorId: 'E', sensorMode: 'OPTICAL', confidence: 'UNVERIFIED', satisfiesRequestId: null, powerCost: 8, storageCost: 3, transmitSec: 4.0 },
      { sectorId: 'E', sensorMode: 'RADAR', confidence: 'PROBABLE', satisfiesRequestId: 'REQ_3', powerCost: 14, storageCost: 3, transmitSec: 4.5 },
      { sectorId: 'F', sensorMode: 'OPTICAL', confidence: 'CONFIRMED', satisfiesRequestId: null, powerCost: 8, storageCost: 3, transmitSec: 4.0 },
      { sectorId: 'F', sensorMode: 'RADAR', confidence: 'CONFIRMED', satisfiesRequestId: null, powerCost: 14, storageCost: 3, transmitSec: 4.5 },
    ];

    it.each(expectedMatrix)(
      '2.x scans Sector $sectorId with $sensorMode -> $confidence (Req: $satisfiesRequestId, -$powerCost PWR, +$storageCost STR, $transmitSec s Tx)',
      ({ sectorId, sensorMode, confidence, satisfiesRequestId, powerCost, storageCost, transmitSec }) => {
        const engine = new MissionEngine();
        const res = engine.scanSector(sectorId, sensorMode);

        expect(res.ok).toBe(true);
        expect(res.code).toBe('OK');
        expect(res.packet).toBeDefined();
        expect(res.packet!.sectorId).toBe(sectorId);
        expect(res.packet!.sensorMode).toBe(sensorMode);
        expect(res.packet!.confidence).toBe(confidence);
        expect(res.packet!.satisfiesRequestId).toBe(satisfiesRequestId);
        expect(res.packet!.storageCost).toBe(storageCost);
        expect(res.packet!.transmitSec).toBe(transmitSec);

        const state = engine.getState();
        expect(state.power).toBe(55 - powerCost);
        expect(state.storageUsed).toBe(storageCost);
        expect(state.selectedPacketId).toBe(res.packet!.id);
      },
    );
  });

  describe('3. Defensive Validation & Boundary Conditions (Power, Storage, Invalid Inputs)', () => {
    it('3.1 rejects invalid sector IDs in selectSector and scanSector without corrupting state', () => {
      const engine = new MissionEngine();
      const selState = engine.selectSector('Z' as SectorId);
      expect(selState.lastActionOk).toBe(false);
      expect(selState.selectedSectorId).toBe('B');

      const scanRes = engine.scanSector('Z' as SectorId, 'OPTICAL');
      expect(scanRes.ok).toBe(false);
      expect(scanRes.code).toBe('INVALID_SECTOR');
      expect(engine.getState().power).toBe(55);
      expect(engine.getState().packets).toHaveLength(0);
    });

    it('3.2 rejects invalid sensor modes in setSensorMode and scanSector without corrupting state', () => {
      const engine = new MissionEngine();
      const modeState = engine.setSensorMode('LIDAR' as SensorMode);
      expect(modeState.lastActionOk).toBe(false);
      expect(modeState.activeSensorMode).toBe('RADAR');

      const scanRes = engine.scanSector('B', 'LIDAR' as SensorMode);
      expect(scanRes.ok).toBe(false);
      expect(scanRes.code).toBe('INVALID_SENSOR');
      expect(engine.getState().power).toBe(55);
    });

    it('3.3 toggles sensor mode cleanly between RADAR and OPTICAL', () => {
      const engine = new MissionEngine();
      expect(engine.getState().activeSensorMode).toBe('RADAR');
      expect(engine.toggleSensorMode().activeSensorMode).toBe('OPTICAL');
      expect(engine.toggleSensorMode().activeSensorMode).toBe('RADAR');
    });

    it('3.4 enforces the 9-unit onboard storage limit after 3 raw scans and recovers storage on discard or process', () => {
      const engine = new MissionEngine();
      expect(engine.scanSector('A', 'OPTICAL').ok).toBe(true); // 3/9 STR
      expect(engine.scanSector('C', 'OPTICAL').ok).toBe(true); // 6/9 STR
      expect(engine.scanSector('D', 'OPTICAL').ok).toBe(true); // 9/9 STR

      const fourthScan = engine.scanSector('F', 'OPTICAL');
      expect(fourthScan.ok).toBe(false);
      expect(fourthScan.code).toBe('INSUFFICIENT_STORAGE');

      // Processing PKT-2 compresses it from 3 STR -> 1 STR, freeing 2 STR (7/9 STR)
      expect(engine.processPacket('PKT-2').ok).toBe(true);
      expect(engine.getState().storageUsed).toBe(7);

      // Still 7 + 3 = 10 > 9 STR for a raw scan until another cube is processed or discarded
      expect(engine.scanSector('F', 'OPTICAL').code).toBe('INSUFFICIENT_STORAGE');

      // Processing PKT-1 frees another 2 STR (5/9 STR)
      expect(engine.processPacket('PKT-1').ok).toBe(true);
      expect(engine.getState().storageUsed).toBe(5);

      // But all 3 physical cubes are still occupied, so scan gives TRAY_FULL
      expect(engine.scanSector('F', 'OPTICAL').code).toBe('TRAY_FULL');

      // Discarding unneeded PKT-3 frees a physical cube slot and 3 STR (2/9 STR)
      expect(engine.discardPacket('PKT-3').ok).toBe(true);
      expect(engine.getState().storageUsed).toBe(2);
      expect(engine.scanSector('F', 'OPTICAL').ok).toBe(true);
      expect(engine.getState().storageUsed).toBe(5);
    });

    it('3.5 enforces power exhaustion boundaries for RADAR scan (14 PWR), OPTICAL scan (8 PWR), and Processing (6 PWR)', () => {
      const engine = new MissionEngine();
      // 3 RADAR scans + 2 discards to keep storage open: 3 * 14 = 42 PWR used -> 13 PWR left
      const p1 = engine.scanSector('A', 'RADAR').packet!; // 41 PWR left
      engine.discardPacket(p1.id);
      const p2 = engine.scanSector('B', 'RADAR').packet!; // 27 PWR left
      engine.discardPacket(p2.id);
      const p3 = engine.scanSector('C', 'RADAR').packet!; // 13 PWR left
      expect(engine.getState().power).toBe(13);

      // 4th RADAR scan requires 14 PWR -> must fail with INSUFFICIENT_POWER
      const radarFail = engine.scanSector('E', 'RADAR');
      expect(radarFail.ok).toBe(false);
      expect(radarFail.code).toBe('INSUFFICIENT_POWER');
      expect(engine.getState().power).toBe(13);

      // OPTICAL scan requires 8 PWR -> succeeds, leaving 5 PWR
      const optOk = engine.scanSector('C', 'OPTICAL');
      expect(optOk.ok).toBe(true);
      expect(engine.getState().power).toBe(5);

      // Processing requires 6 PWR -> must fail when only 5 PWR remains
      const procFail = engine.processPacket(p3.id);
      expect(procFail.ok).toBe(false);
      expect(procFail.code).toBe('INSUFFICIENT_POWER');
      expect(engine.getState().power).toBe(5);
    });
  });

  describe('4. Onboard Processing Cradle Rules', () => {
    it('4.1 rejects processing an [X] UNVERIFIED cloud-blocked packet (scientific honesty rule)', () => {
      const engine = new MissionEngine();
      const scanB = engine.scanSector('B', 'OPTICAL');
      expect(scanB.packet?.confidence).toBe('UNVERIFIED');

      const procResult = engine.processPacket(scanB.packet!.id);
      expect(procResult.ok).toBe(false);
      expect(procResult.code).toBe('CANNOT_PROCESS_UNVERIFIED');
      expect(engine.getState().power).toBe(47);
      expect(engine.getState().storageUsed).toBe(3);
    });

    it('4.2 rejects processing the same packet twice (ALREADY_PROCESSED)', () => {
      const engine = new MissionEngine();
      const pkt = engine.scanSector('B', 'RADAR').packet!;
      expect(engine.processPacket(pkt.id).ok).toBe(true);

      const secondProc = engine.processPacket(pkt.id);
      expect(secondProc.ok).toBe(false);
      expect(secondProc.code).toBe('ALREADY_PROCESSED');
      expect(engine.getState().power).toBe(55 - 14 - 6);
    });

    it('4.3 rejects processing when no packet or non-existent packet is selected (PACKET_NOT_FOUND)', () => {
      const engine = new MissionEngine();
      expect(engine.processPacket(null).code).toBe('PACKET_NOT_FOUND');
      expect(engine.processPacket('PKT-999').code).toBe('PACKET_NOT_FOUND');
    });

    it('4.4 updates downlinkCommittedSec automatically when an already-queued packet is processed', () => {
      const engine = new MissionEngine();
      const pkt = engine.scanSector('B', 'RADAR').packet!;
      engine.queuePacket(pkt.id);
      expect(engine.getState().downlinkCommittedSec).toBe(4.5);

      engine.processPacket(pkt.id);
      expect(engine.getState().downlinkCommittedSec).toBe(1.8);
    });
  });

  describe('5. Downlink Bay Queue Management & Reordering', () => {
    it('5.1 enforces three physical cubes and prevents duplicate queue entries', () => {
      const engine = new MissionEngine();
      const p1 = engine.scanSector('B', 'RADAR').packet!; // 14 PWR -> 41 PWR
      const p2 = engine.scanSector('C', 'OPTICAL').packet!; // 8 PWR -> 33 PWR
      engine.processPacket(p1.id); // 6 PWR -> 27 PWR, 1 STR
      engine.processPacket(p2.id); // 6 PWR -> 21 PWR, 1 STR
      const p3 = engine.scanSector('D', 'OPTICAL').packet!; // 8 PWR -> 13 PWR, 3 STR
      expect(engine.scanSector('A', 'OPTICAL').code).toBe('TRAY_FULL');

      expect(engine.queuePacket(p1.id).ok).toBe(true);
      expect(engine.queuePacket(p2.id).ok).toBe(true);
      expect(engine.queuePacket(p3.id).ok).toBe(true);
      expect(engine.getState().queuePacketIds).toEqual([p1.id, p2.id, p3.id]);

      // Re-queueing an already queued packet at slot 0 moves it without duplicating
      expect(engine.queuePacket(p3.id, 0).ok).toBe(true);
      expect(engine.getState().queuePacketIds).toEqual([p3.id, p1.id, p2.id]);

      expect(engine.getState().packets).toHaveLength(3);
      expect(engine.discardPacket(p2.id).ok).toBe(true);
      expect(engine.scanSector('A', 'OPTICAL').ok).toBe(true);
    });

    it('5.4 handles selectPacket for existing, non-existent, and null packet IDs', () => {
      const engine = new MissionEngine();
      const p1 = engine.scanSector('C', 'OPTICAL').packet!;
      expect(engine.selectPacket(null).selectedPacketId).toBeNull();
      const selOk = engine.selectPacket(p1.id);
      expect(selOk.selectedPacketId).toBe(p1.id);
      expect(selOk.lastActionOk).toBe(true);
      const selBad = engine.selectPacket('PKT-404');
      expect(selBad.lastActionOk).toBe(false);
    });

    it('5.2 supports unqueuePacket, moveQueuedPacketUp, and reorderQueue', () => {
      const engine = new MissionEngine();
      const p1 = engine.scanSector('B', 'RADAR').packet!;
      const p2 = engine.scanSector('C', 'OPTICAL').packet!;
      const p3 = engine.scanSector('E', 'RADAR').packet!;

      engine.queuePacket(p1.id);
      engine.queuePacket(p2.id);
      engine.queuePacket(p3.id);

      // Move p3 up one slot
      expect(engine.moveQueuedPacketUp(p3.id).ok).toBe(true);
      expect(engine.getState().queuePacketIds).toEqual([p1.id, p3.id, p2.id]);

      // Explicit reorderQueue
      expect(engine.reorderQueue([p2.id, p3.id, p1.id]).ok).toBe(true);
      expect(engine.getState().queuePacketIds).toEqual([p2.id, p3.id, p1.id]);

      // Unqueue p3
      expect(engine.unqueuePacket(p3.id).ok).toBe(true);
      expect(engine.getState().queuePacketIds).toEqual([p2.id, p1.id]);

      // Unqueueing an already-unqueued packet returns NOT_QUEUED
      expect(engine.unqueuePacket(p3.id).code).toBe('NOT_QUEUED');
    });

    it('5.3 removes a packet from the queue and recalculates timing if that packet is discarded', () => {
      const engine = new MissionEngine();
      const p1 = engine.scanSector('B', 'RADAR').packet!; // 4.5s
      const p2 = engine.scanSector('C', 'OPTICAL').packet!; // 4.0s
      engine.queuePacket(p1.id);
      engine.queuePacket(p2.id);
      expect(engine.getState().downlinkCommittedSec).toBe(8.5);

      engine.discardPacket(p1.id);
      expect(engine.getState().queuePacketIds).toEqual([p2.id]);
      expect(engine.getState().downlinkCommittedSec).toBe(4.0);
    });
  });

  describe('6. Live Downlink Transmission Window, Phase Locking & Scoring Strategies', () => {
    it('6.1 rejects startDownlink and commitDownlink when the Downlink Bay queue is empty (EMPTY_QUEUE)', () => {
      const engine = new MissionEngine();
      engine.scanSector('B', 'RADAR'); // scanned in tray, but NOT queued!

      const startRes = engine.startDownlink();
      expect(startRes.ok).toBe(false);
      expect(startRes.code).toBe('EMPTY_QUEUE');
      expect(engine.getState().phase).toBe('OPERATIONS');

      const commitRes = engine.commitDownlink();
      expect(commitRes).toBeNull();
      expect(engine.getState().phase).toBe('OPERATIONS');
    });

    it('6.2 steps through DOWNLINK phase incrementally via tickDownlink(deltaSec) and locks operations', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;
      engine.processPacket(pktB.id); // 1.8s
      engine.queuePacket(pktB.id); // 0.0s -> 1.8s
      engine.queuePacket(pktC.id); // 1.8s -> 5.8s

      const start = engine.startDownlink();
      expect(start.ok).toBe(true);
      expect(engine.getState().phase).toBe('DOWNLINK');
      expect(engine.getState().activeDownlinkPacketId).toBe(pktB.id);

      // Operations must be locked during DOWNLINK
      expect(engine.scanSector('E', 'RADAR').code).toBe('INVALID_PHASE');
      expect(engine.processPacket(pktC.id).code).toBe('INVALID_PHASE');
      expect(engine.queuePacket(pktC.id).code).toBe('INVALID_PHASE');
      expect(engine.unqueuePacket(pktC.id).code).toBe('INVALID_PHASE');
      expect(engine.discardPacket(pktC.id).code).toBe('INVALID_PHASE');

      // Advance 1.0s: pktB still transmitting
      let st = engine.tickDownlink(1.0);
      expect(st.phase).toBe('DOWNLINK');
      expect(st.packets.find((p) => p.id === pktB.id)?.transmitted).toBe(false);
      expect(st.activeDownlinkPacketId).toBe(pktB.id);

      // Advance another 1.0s (total 2.0s >= 1.8s): pktB transmitted, pktC now active
      st = engine.tickDownlink(1.0);
      expect(st.phase).toBe('DOWNLINK');
      expect(st.packets.find((p) => p.id === pktB.id)?.transmitted).toBe(true);
      expect(st.activeDownlinkPacketId).toBe(pktC.id);

      // Advance another 4.0s (total 6.0s >= 5.8s): all queued packets finished -> transitions to DEBRIEF!
      st = engine.tickDownlink(4.0);
      expect(st.phase).toBe('DEBRIEF');
      expect(st.debrief).not.toBeNull();
      expect(st.debrief!.transmittedPacketIds).toEqual([pktB.id, pktC.id]);
      expect(st.debrief!.downlinkUsedSec).toBe(5.8);
    });

    it('6.3 never scores unqueued packets sitting in the storage tray at downlink completion', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;
      const pktE = engine.scanSector('E', 'RADAR').packet!;

      // Only queue pktB; leave pktC and pktE unqueued in the tray
      engine.queuePacket(pktB.id);
      const debrief = engine.commitDownlink()!;

      expect(debrief.transmittedPacketIds).toEqual([pktB.id]);
      expect(debrief.requestsVerifiedCount).toBe(1);
      expect(debrief.requestsUnverifiedCount).toBe(2);
      expect(debrief.missionRank).toBe('CRITICAL GAP');
    });

    it('6.4 drops third packet when 3 unprocessed cubes (13.0s total) exceed the 10.0s downlink window', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!; // 4.5s
      const pktC = engine.scanSector('C', 'OPTICAL').packet!; // 4.0s
      const pktE = engine.scanSector('E', 'RADAR').packet!; // 4.5s

      engine.queuePacket(pktB.id);
      engine.queuePacket(pktC.id);
      engine.queuePacket(pktE.id);
      expect(engine.getState().downlinkCommittedSec).toBe(13.0);

      const debrief = engine.commitDownlink()!;
      expect(debrief.transmittedPacketIds).toEqual([pktB.id, pktC.id]);
      expect(debrief.droppedPacketIds).toEqual([pktE.id]);
      expect(debrief.downlinkUsedSec).toBe(10.0);
      expect(debrief.requestsVerifiedCount).toBe(2);
      expect(debrief.requestsUnverifiedCount).toBe(1);
      expect(debrief.missionRank).toBe('PARTIAL DOWNLINK');
    });

    it('6.5 achieves 100/100 OPTIMAL TRIAGE when scanning B(RADAR), C(OPTICAL), E(RADAR) and processing 2 cubes', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;
      const pktE = engine.scanSector('E', 'RADAR').packet!;

      expect(engine.processPacket(pktB.id).ok).toBe(true);
      expect(engine.processPacket(pktE.id).ok).toBe(true);

      engine.queuePacket(pktB.id);
      engine.queuePacket(pktC.id);
      engine.queuePacket(pktE.id);

      expect(engine.getState().downlinkCommittedSec).toBe(7.6);

      const debrief = engine.commitDownlink()!;
      expect(debrief.missionRank).toBe('OPTIMAL TRIAGE');
      expect(debrief.totalScore).toBe(100);
      expect(debrief.requestsVerifiedCount).toBe(3);
      expect(debrief.droppedPacketIds).toHaveLength(0);
      expect(debrief.downlinkUsedSec).toBe(7.6);
      expect(debrief.powerRemaining).toBe(7);
    });

    it('6.6 awards PARTIAL credit when Sector C is scanned with RADAR ([?] PROBABLE due to steel truss glare) instead of OPTICAL', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'RADAR').packet!;
      const pktE = engine.scanSector('E', 'RADAR').packet!;

      engine.processPacket(pktB.id);
      engine.processPacket(pktE.id);

      engine.queuePacket(pktB.id);
      engine.queuePacket(pktC.id);
      engine.queuePacket(pktE.id);

      const debrief = engine.commitDownlink()!;
      const req2Eval = debrief.evaluations.find((e) => e.requestId === 'REQ_2')!;
      expect(req2Eval.status).toBe('PARTIAL');
      expect(req2Eval.statusBadge).toBe('[?] PARTIAL');
      expect(debrief.requestsVerifiedCount).toBe(2);
      expect(debrief.requestsPartialCount).toBe(1);
    });

    it('6.7 resets cleanly from OPERATIONS, DOWNLINK, or DEBRIEF back to initial state', () => {
      const engine = new MissionEngine();
      const pkt = engine.scanSector('B', 'RADAR').packet!;
      engine.queuePacket(pkt.id);
      engine.commitDownlink();
      expect(engine.getState().phase).toBe('DEBRIEF');

      const resetState = engine.reset();
      expect(resetState.phase).toBe('OPERATIONS');
      expect(resetState.power).toBe(MISSION_BUDGET.initialPower);
      expect(resetState.storageUsed).toBe(0);
      expect(resetState.packets).toHaveLength(0);
      expect(resetState.queuePacketIds).toHaveLength(0);
      expect(resetState.debrief).toBeNull();
      expect(Object.keys(GROUND_REQUESTS)).toHaveLength(3);
    });
  });

  describe('7. Group 7.1: Scientific Phenomenology Metadata & Signal-to-Noise Ratio (SNR)', () => {
    it('7.1 verifies all 12 sector/sensor combinations contain authentic Earth-observation telemetry', () => {
      for (const secId of SECTOR_ORDER) {
        const sec = SECTORS[secId];
        for (const mode of ['OPTICAL', 'RADAR'] as SensorMode[]) {
          const outcome = sec.outcomes[mode];
          expect(outcome.snrDb).toBeGreaterThan(0);
          expect(outcome.swathWidthKm).toBeGreaterThan(10);
          expect(outcome.resolutionMeters).toBeGreaterThan(0);
          expect(outcome.phenomenologyTag).toBeTruthy();
          expect(outcome.phenomenologyTag.length).toBeGreaterThan(5);
        }
      }
    });

    it('7.2 populates DataPacket with SNR, swath width, resolution, and phenomenology tag on scan', () => {
      const engine = new MissionEngine();
      const pkt = engine.scanSector('B', 'RADAR').packet!;
      expect(pkt.snrDb).toBe(22.8);
      expect(pkt.swathWidthKm).toBe(24.0);
      expect(pkt.resolutionMeters).toBe(2.2);
      expect(pkt.phenomenologyTag).toBe('SPECULAR_WATER_DOUBLE_BOUNCE_SAR');

      const optPkt = engine.scanSector('C', 'OPTICAL').packet!;
      expect(optPkt.snrDb).toBe(29.2);
      expect(optPkt.swathWidthKm).toBe(18.5);
      expect(optPkt.resolutionMeters).toBe(0.75);
      expect(optPkt.phenomenologyTag).toBe('VISIBLE_NEAR_INFRARED_REFLECTANCE');
    });

    it('7.3 attaches correct compression algorithm tag to processed data packets', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;

      const resB = engine.processPacket(pktB.id);
      expect(resB.ok).toBe(true);
      expect(resB.packet?.compressionAlgorithm).toBe('NDWI_WATER_MASK_EXTRACTION');

      const resC = engine.processPacket(pktC.id);
      expect(resC.ok).toBe(true);
      expect(resC.packet?.compressionAlgorithm).toBe('EDGE_TRUSS_VECTORIZATION');
    });
  });

  describe('8. Group 7.2: Multi-Pass Scenarios ("Best Reason to Come Back" Award)', () => {
    it('8.1 verifies default scenario is STANDARD_INDUS_PASS and setScenario / cycleScenario work properly', () => {
      const engine = new MissionEngine();
      expect(engine.getState().scenarioId).toBe('STANDARD_INDUS_PASS');

      engine.setScenario('MONSOON_SUPERCELL_PASS');
      expect(engine.getState().scenarioId).toBe('MONSOON_SUPERCELL_PASS');
      expect(engine.getState().maxPower).toBe(54);
      expect(engine.getState().downlinkWindowSec).toBe(9.0);

      engine.setScenario('SOLAR_BROWNOUT_PASS');
      expect(engine.getState().scenarioId).toBe('SOLAR_BROWNOUT_PASS');
      expect(engine.getState().maxPower).toBe(50);
      expect(engine.getState().maxStorage).toBe(6);
      expect(engine.getState().downlinkWindowSec).toBe(8.0);

      engine.cycleScenario();
      expect(engine.getState().scenarioId).toBe('STANDARD_INDUS_PASS');
    });

    it('8.2 verifies MONSOON_SUPERCELL_PASS covers Sector C in dense storm clouds, giving UNVERIFIED for OPTICAL', () => {
      const engine = new MissionEngine('MONSOON_SUPERCELL_PASS');
      const optC = engine.scanSector('C', 'OPTICAL').packet!;
      expect(optC.confidence).toBe('UNVERIFIED');
      expect(optC.confidenceBadge).toBe('[X] UNVERIFIED');
      expect(optC.snrDb).toBe(3.8);

      const radC = engine.scanSector('C', 'RADAR').packet!;
      expect(radC.confidence).toBe('PROBABLE');
      expect(radC.confidenceBadge).toBe('[?] PROBABLE');
      expect(radC.satisfiesRequestId).toBe('REQ_2');
    });

    it('8.3 verifies SOLAR_BROWNOUT_PASS enforces tight 6 STR storage limit and requires mid-pass cradle compression', () => {
      const engine = new MissionEngine('SOLAR_BROWNOUT_PASS');
      expect(engine.getState().maxStorage).toBe(6);

      // 1. Scan 2 raw packets (3 STR each) -> fills storage (6/6)
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;
      expect(engine.getState().storageUsed).toBe(6);

      // 2. Attempting a 3rd scan without processing fails with INSUFFICIENT_STORAGE
      const failScan1 = engine.scanSector('E', 'RADAR');
      expect(failScan1.ok).toBe(false);
      expect(failScan1.code).toBe('INSUFFICIENT_STORAGE');

      // 3. Compress pktB in cradle -> frees 2 STR (drops to 4/6).
      // A raw 3-STR scan still needs 4 + 3 = 7 > 6, so it still fails!
      const procB = engine.processPacket(pktB.id);
      expect(procB.ok).toBe(true);
      expect(engine.getState().storageUsed).toBe(4);

      const failScan2 = engine.scanSector('E', 'RADAR');
      expect(failScan2.ok).toBe(false);
      expect(failScan2.code).toBe('INSUFFICIENT_STORAGE');

      // 4. Compress pktC as well -> frees 2 STR (drops to 2/6 STR: 1 from B + 1 from C)
      const procC = engine.processPacket(pktC.id);
      expect(procC.ok).toBe(true);
      expect(engine.getState().storageUsed).toBe(2);

      // 5. Now scanning Sector E succeeds and fills 5/6 STR!
      const pktE = engine.scanSector('E', 'RADAR').packet!;
      expect(pktE).toBeDefined();
      expect(engine.getState().storageUsed).toBe(5);
    });

    it('8.4 proves SOLAR_BROWNOUT_PASS is 100% deterministically solvable for OPTIMAL TRIAGE', () => {
      const engine = new MissionEngine('SOLAR_BROWNOUT_PASS');
      expect(engine.getState().power).toBe(50);
      expect(engine.getState().maxStorage).toBe(6);

      // Step 1: Scan B (RADAR) -> 14 PWR, 3/6 STR
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      expect(engine.getState().power).toBe(36);
      expect(engine.getState().storageUsed).toBe(3);

      // Step 2: Compress B immediately in cradle -> 6 PWR, 1/6 STR
      engine.processPacket(pktB.id);
      expect(engine.getState().power).toBe(30);
      expect(engine.getState().storageUsed).toBe(1);

      const pktE = engine.scanSector('E', 'RADAR').packet!;
      expect(engine.getState().power).toBe(16);
      engine.processPacket(pktE.id);
      expect(engine.getState().power).toBe(10);
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;
      expect(engine.getState().power).toBe(2);
      expect(engine.getState().storageUsed).toBe(5);
      engine.queuePacket(pktB.id);
      engine.queuePacket(pktE.id);
      engine.queuePacket(pktC.id);

      const debrief = engine.commitDownlink()!;
      expect(debrief.requestsVerifiedCount).toBe(3);
      expect(debrief.totalScore).toBe(100);
      expect(debrief.downlinkUsedSec).toBe(7.6);
      expect(debrief.evaluations.find((e) => e.requestId === 'REQ_1')?.status).toBe('VERIFIED');
      expect(debrief.evaluations.find((e) => e.requestId === 'REQ_2')?.status).toBe('VERIFIED');
    });
  });

  describe('9. Group 7.3: Efficiency Grades & Counterfactual Replay Guidance', () => {
    it('9.1 awards S-Rank efficiency grade for 100/100 score with zero drops and <= 7.6s downlink', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      const pktC = engine.scanSector('C', 'OPTICAL').packet!;
      const pktE = engine.scanSector('E', 'RADAR').packet!;

      engine.processPacket(pktB.id);
      engine.processPacket(pktE.id);

      engine.queuePacket(pktB.id);
      engine.queuePacket(pktC.id);
      engine.queuePacket(pktE.id);

      const debrief = engine.commitDownlink()!;
      expect(debrief.missionRank).toBe('OPTIMAL TRIAGE');
      expect(debrief.totalScore).toBe(100);
      expect(debrief.efficiencyGrade).toBe('S');
      expect(debrief.benchmarkDownlinkSec).toBe(7.6);
      expect(debrief.benchmarkPowerUsed).toBe(48);
    });

    it('9.2 calculates correct efficiency grades across different score tiers', () => {
      // Test A-Rank (partial radar on C gives 88 score)
      const engineA = new MissionEngine();
      const bA = engineA.scanSector('B', 'RADAR').packet!;
      const cA = engineA.scanSector('C', 'RADAR').packet!;
      const eA = engineA.scanSector('E', 'RADAR').packet!;
      engineA.processPacket(bA.id);
      engineA.processPacket(eA.id);
      engineA.queuePacket(bA.id);
      engineA.queuePacket(cA.id);
      engineA.queuePacket(eA.id);
      const debriefA = engineA.commitDownlink()!;
      expect(debriefA.totalScore).toBeGreaterThanOrEqual(80);
      expect(debriefA.totalScore).toBeLessThan(100);
      expect(debriefA.efficiencyGrade).toBe('A');

      // Test C-Rank (only 1 request verified)
      const engineC = new MissionEngine();
      const bC = engineC.scanSector('B', 'RADAR').packet!;
      engineC.queuePacket(bC.id);
      const debriefC = engineC.commitDownlink()!;
      expect(debriefC.totalScore).toBeLessThan(60);
      expect(debriefC.efficiencyGrade).toBe('C');
    });

    it('9.3 produces deterministic counterfactual explanations in debrief report', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'OPTICAL').packet!; // Unverified scan!
      engine.queuePacket(pktB.id);
      const debrief = engine.commitDownlink()!;
      expect(debrief.counterfactualComparison).toContain('scan B RADAR');
      expect(debrief.deterministicRecommendation).toContain('RADAR on Sector B');
    });
  });

  describe('10. Mathematical Invariants, Error Recovery & Evidence Provenance', () => {
    it('10.1 enforces power exhaustion invariant: power never drops below 0 and state is not mutated on failure', () => {
      const engine = new MissionEngine();
      engine.scanSector('B', 'RADAR'); // -14 PWR -> 41
      engine.scanSector('E', 'RADAR'); // -14 PWR -> 27
      engine.scanSector('C', 'RADAR'); // -14 PWR -> 13
      expect(engine.getState().power).toBe(13);

      const pktC = engine.getState().packets[2];
      engine.discardPacket(pktC.id);
      expect(engine.getState().power).toBe(13);

      const failRes = engine.scanSector('A', 'RADAR');
      expect(failRes.ok).toBe(false);
      expect(failRes.code).toBe('INSUFFICIENT_POWER');
      expect(engine.getState().power).toBe(13);
      expect(engine.getState().packets.length).toBe(2);
    });

    it('10.2 enforces storage capacity invariant: storageUsed never exceeds maxStorage and state is not mutated', () => {
      const engine = new MissionEngine('SOLAR_BROWNOUT_PASS'); // 6 STR max
      expect(engine.getState().maxStorage).toBe(6);

      engine.scanSector('B', 'RADAR'); // 3 STR
      engine.scanSector('C', 'OPTICAL'); // 3 STR -> 6/6 STR
      expect(engine.getState().storageUsed).toBe(6);

      const failScan = engine.scanSector('E', 'RADAR'); // Needs 3 STR
      expect(failScan.ok).toBe(false);
      expect(failScan.code).toBe('INSUFFICIENT_STORAGE');
      expect(engine.getState().storageUsed).toBe(6);
      expect(engine.getState().packets.length).toBe(2);
    });

    it('10.3 enforces tray capacity invariant: cannot exceed 3 physical data cubes even if storage allows', () => {
      const engine = new MissionEngine('STANDARD_INDUS_PASS'); // 9 STR max, 55 PWR
      const p1 = engine.scanSector('A', 'OPTICAL').packet!; // 8 PWR, 3 STR
      engine.processPacket(p1.id); // 6 PWR, drops to 1 STR. (14 PWR spent)
      const p2 = engine.scanSector('D', 'OPTICAL').packet!; // 8 PWR, 3 STR
      engine.processPacket(p2.id); // 6 PWR, drops to 1 STR. (28 PWR spent)
      const p3 = engine.scanSector('C', 'OPTICAL').packet!; // 8 PWR, 3 STR. (36 PWR spent)
      expect(engine.getState().power).toBe(19); // 19 PWR remaining!
      expect(engine.getState().storageUsed).toBe(5); // Only 5/9 STR used!
      expect(engine.getState().packets.length).toBe(3); // All 3 physical cubes held!

      const failScan = engine.scanSector('F', 'OPTICAL'); // Needs 8 PWR (has 19), 3 STR (has 4 free)
      expect(failScan.ok).toBe(false);
      expect(failScan.code).toBe('TRAY_FULL');
      expect(engine.getState().packets.length).toBe(3);
    });

    it('10.4 enforces processing safety: invalid ID, already processed, or unverified returns recoverable error', () => {
      const engine = new MissionEngine();
      const p1 = engine.scanSector('B', 'OPTICAL').packet!;

      const unvProc = engine.processPacket(p1.id);
      expect(unvProc.ok).toBe(false);
      expect(unvProc.code).toBe('CANNOT_PROCESS_UNVERIFIED');

      const ghostProc = engine.processPacket('PKT-999');
      expect(ghostProc.ok).toBe(false);
      expect(ghostProc.code).toBe('PACKET_NOT_FOUND');

      const p2 = engine.scanSector('C', 'OPTICAL').packet!;
      const okProc = engine.processPacket(p2.id);
      expect(okProc.ok).toBe(true);

      const doubleProc = engine.processPacket(p2.id);
      expect(doubleProc.ok).toBe(false);
      expect(doubleProc.code).toBe('ALREADY_PROCESSED');
    });

    it('10.5 enforces queue invariants: prevents duplicate queue entries and blocks empty-queue commit', () => {
      const engine = new MissionEngine();
      const emptyCommit = engine.startDownlink();
      expect(emptyCommit.ok).toBe(false);
      expect(emptyCommit.code).toBe('EMPTY_QUEUE');
      expect(engine.getState().phase).toBe('OPERATIONS');

      const p1 = engine.scanSector('B', 'RADAR').packet!;
      engine.queuePacket(p1.id);
      expect(engine.getState().queuePacketIds).toEqual([p1.id]);

      engine.queuePacket(p1.id);
      expect(engine.getState().queuePacketIds).toEqual([p1.id]);
    });

    it('10.6 enforces phase locking: operational actions rejected during or after downlink', () => {
      const engine = new MissionEngine();
      const p1 = engine.scanSector('B', 'RADAR').packet!;
      engine.queuePacket(p1.id);
      engine.startDownlink();
      expect(engine.getState().phase).toBe('DOWNLINK');

      const lateScan = engine.scanSector('C', 'OPTICAL');
      expect(lateScan.ok).toBe(false);
      expect(lateScan.code).toBe('INVALID_PHASE');

      engine.commitDownlink();
      expect(engine.getState().phase).toBe('DEBRIEF');

      const doubleDownlink = engine.startDownlink();
      expect(doubleDownlink.ok).toBe(false);
      expect(doubleDownlink.code).toBe('INVALID_PHASE');
    });

    it('10.7 tracks full evidence provenance lineage through observation, processing, queue, and transmission', () => {
      const engine = new MissionEngine();
      const pktB = engine.scanSector('B', 'RADAR').packet!;
      expect(pktB.provenanceLineage).toContain('OBS[SEC-B|RADAR|STEP-');
      expect(pktB.rawStorageCost).toBe(3);
      expect(pktB.rawTransmitSec).toBe(4.5);
      expect(pktB.compressionRatio).toBe(1.0);

      engine.processPacket(pktB.id);
      const procPkt = engine.getState().packets.find((p) => p.id === pktB.id)!;
      expect(procPkt.provenanceLineage).toContain('CRADLE[NDWI_WATER_MASK_EXTRACTION]');
      expect(procPkt.compressionRatio).toBe(3.0);

      engine.queuePacket(pktB.id);
      const queuedPkt = engine.getState().packets.find((p) => p.id === pktB.id)!;
      expect(queuedPkt.provenanceLineage).toContain('BAY[SLOT-1]');

      const debrief = engine.commitDownlink()!;
      expect(debrief.evidenceProvenance).toBeDefined();
      expect(debrief.evidenceProvenance!.length).toBeGreaterThanOrEqual(1);
      const provRec = debrief.evidenceProvenance!.find((p) => p.packetId === pktB.id)!;
      expect(provRec.provenance).toContain('S-BAND-TX[OK]');
      expect(provRec.processed).toBe(true);
      expect(provRec.transmitted).toBe(true);
    });

    it('10.8 enforces complete state reset integrity without memory residue', () => {
      const engine = new MissionEngine();
      engine.scanSector('B', 'RADAR');
      engine.scanSector('C', 'OPTICAL');
      engine.reset();

      const st = engine.getState();
      expect(st.phase).toBe('OPERATIONS');
      expect(st.power).toBe(55);
      expect(st.storageUsed).toBe(0);
      expect(st.packets.length).toBe(0);
      expect(st.queuePacketIds.length).toBe(0);
      expect(st.debrief).toBeNull();
    });
  });
});
