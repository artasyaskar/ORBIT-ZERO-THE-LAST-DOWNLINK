/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * The globe's sector outlines (one ribbon per sector) and storm-cloud caps, drawn as ONE mesh instead of one
 * per part. Every part keeps its own look in vertex attributes read by the baked standard material: colour
 * and opacity (RGBA colour), glow (emissive x intensity), roughness and metalness; a hidden part has alpha 0.
 * The mission system changes a part's look by sector and part name; only that part's vertices are rewritten.
 */

import {
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from '@iwsdk/core';
import type { SectorId } from '../../mission/types';
import { createBakedStandardMaterial } from './hardsurface';

export const SECTOR_OVERLAYS_MESH_NAME = 'SectorOverlays';

export type SectorOverlayPart = 'ribbon' | 'cap';

/** One part's look, in the same terms as the MeshStandardMaterial it replaces (sRGB hex colours). */
export interface SectorOverlayLook {
  color: number;
  emissive: number;
  emissiveIntensity: number;
  opacity: number;
  visible: boolean;
}

export interface SectorOverlaySource {
  sectorId: SectorId;
  part: SectorOverlayPart;
  /** A built part. Its geometry (placed by its transform under `space`) and its material's look are merged. */
  mesh: Mesh;
}

/** Vertex range and current look of one part. Plain data in userData, so it survives Object3D.clone(). */
interface OverlayRecord {
  start: number;
  count: number;
  look: SectorOverlayLook;
}
type OverlayTable = Record<string, OverlayRecord>;

const key = (sectorId: SectorId, part: SectorOverlayPart) => `${sectorId}:${part}`;
const _linear = new Color();

/**
 * Merges the parts into one mesh named SECTOR_OVERLAYS_MESH_NAME (render order 3, transparent, both sides,
 * no depth writes, like the parts). Ribbons are drawn before caps: caps float above the ribbons, so this is
 * back to front on the visible side of the globe. The source meshes are removed from their parents; add the
 * returned mesh to `space`.
 */
export function mergeSectorOverlays(space: Object3D, sources: SectorOverlaySource[]): Mesh {
  space.updateMatrixWorld(true);
  const toSpace = new Matrix4();
  const inverseSpace = new Matrix4().copy(space.matrixWorld).invert();
  const ordered = [...sources.filter((s) => s.part === 'ribbon'), ...sources.filter((s) => s.part === 'cap')];

  const positions: number[] = [];
  const normals: number[] = [];
  const roughMetal: number[] = [];
  const indices: number[] = [];
  const table: OverlayTable = {};
  let vertexOffset = 0;
  for (const { sectorId, part, mesh } of ordered) {
    const material = mesh.material as MeshStandardMaterial;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(toSpace.multiplyMatrices(inverseSpace, mesh.matrixWorld));
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    const pos = geometry.getAttribute('position');
    const nrm = geometry.getAttribute('normal');
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
      roughMetal.push(material.roughness, material.metalness);
    }
    const index = geometry.getIndex();
    const indexCount = index ? index.count : pos.count;
    for (let i = 0; i < indexCount; i++) indices.push(vertexOffset + (index ? index.getX(i) : i));
    table[key(sectorId, part)] = {
      start: vertexOffset,
      count: pos.count,
      look: {
        color: material.color.getHex(),
        emissive: material.emissive.getHex(),
        emissiveIntensity: material.emissiveIntensity,
        opacity: material.opacity,
        visible: mesh.visible,
      },
    };
    vertexOffset += pos.count;
    geometry.dispose();
    mesh.removeFromParent();
  }

  const merged = new BufferGeometry();
  merged.setAttribute('position', new Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new Float32BufferAttribute(new Float32Array(vertexOffset * 4), 4).setUsage(DynamicDrawUsage));
  merged.setAttribute('bakedEmissive', new Float32BufferAttribute(new Float32Array(vertexOffset * 3), 3).setUsage(DynamicDrawUsage));
  merged.setAttribute('bakedRoughMetal', new Float32BufferAttribute(roughMetal, 2));
  merged.setIndex(indices);
  merged.computeBoundingSphere();

  const material = createBakedStandardMaterial(DoubleSide, false);
  material.transparent = true;
  material.depthWrite = false;
  material.forceSinglePass = true; // thin parts on the globe: one pass, as the parts had

  const mesh = new Mesh(merged, material);
  mesh.name = SECTOR_OVERLAYS_MESH_NAME;
  mesh.renderOrder = 3;
  mesh.userData.sectorOverlays = table;
  for (const record of Object.values(table)) writeRecord(merged, record);
  return mesh;
}

/** The look a part has now, or undefined when the mesh has no such part (e.g. a sector without a storm cap). */
export function getSectorOverlayLook(mesh: Object3D | undefined, sectorId: SectorId, part: SectorOverlayPart): Readonly<SectorOverlayLook> | undefined {
  return (mesh?.userData.sectorOverlays as OverlayTable | undefined)?.[key(sectorId, part)]?.look;
}

/**
 * Changes some of a part's look; fields left out keep their value (as with the material it replaces).
 * Rewrites the part's vertices only when something changed. Returns false when the part does not exist.
 */
export function setSectorOverlayLook(
  mesh: Object3D | undefined,
  sectorId: SectorId,
  part: SectorOverlayPart,
  change: Partial<SectorOverlayLook>,
): boolean {
  const record = recordOf(mesh, sectorId, part);
  if (!record || !(mesh instanceof Mesh)) return false;
  const look = record.look;
  let changed = false;
  if (change.color !== undefined && change.color !== look.color) { look.color = change.color; changed = true; }
  if (change.emissive !== undefined && change.emissive !== look.emissive) { look.emissive = change.emissive; changed = true; }
  if (change.emissiveIntensity !== undefined && change.emissiveIntensity !== look.emissiveIntensity) { look.emissiveIntensity = change.emissiveIntensity; changed = true; }
  if (change.opacity !== undefined && change.opacity !== look.opacity) { look.opacity = change.opacity; changed = true; }
  if (change.visible !== undefined && change.visible !== look.visible) { look.visible = change.visible; changed = true; }
  if (changed) writeRecord(mesh.geometry, record);
  return true;
}

/** Per-frame glow pulse without allocating a change object. */
export function setSectorOverlayGlow(mesh: Object3D | undefined, sectorId: SectorId, part: SectorOverlayPart, emissiveIntensity: number): void {
  const record = recordOf(mesh, sectorId, part);
  if (!record || !(mesh instanceof Mesh) || record.look.emissiveIntensity === emissiveIntensity) return;
  record.look.emissiveIntensity = emissiveIntensity;
  writeRecord(mesh.geometry, record);
}

function recordOf(mesh: Object3D | undefined, sectorId: SectorId, part: SectorOverlayPart): OverlayRecord | undefined {
  return (mesh?.userData.sectorOverlays as OverlayTable | undefined)?.[key(sectorId, part)];
}

function writeRecord(geometry: BufferGeometry, { start, count, look }: OverlayRecord): void {
  const colour = geometry.getAttribute('color') as Float32BufferAttribute;
  const glow = geometry.getAttribute('bakedEmissive') as Float32BufferAttribute;
  // Color.setHex converts sRGB hex to the linear working space, exactly as a material's colour uniform is.
  _linear.setHex(look.color);
  const alpha = look.visible ? look.opacity : 0;
  for (let i = start; i < start + count; i++) colour.setXYZW(i, _linear.r, _linear.g, _linear.b, alpha);
  // three.js multiplies a material's emissive by emissiveIntensity before upload; the attribute holds that product.
  _linear.setHex(look.emissive).multiplyScalar(look.emissiveIntensity);
  for (let i = start; i < start + count; i++) glow.setXYZ(i, _linear.r, _linear.g, _linear.b);
  colour.addUpdateRange(start * 4, count * 4);
  glow.addUpdateRange(start * 3, count * 3);
  colour.needsUpdate = true;
  glow.needsUpdate = true;
}
