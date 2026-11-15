import type { Bone, Xf } from '../core/mesh';
import { add, applyM, IDENTITY, type M3, mulM, sub, transposeM, type V3 } from '../core/vec';

/** Composition: apply `b` first, then `a`. */
export const xfMul = (a: Xf, b: Xf): Xf => ({ r: mulM(a.r, b.r), o: add(applyM(a.r, b.o), a.o) });

export const xfInv = (x: Xf): Xf => {
  const rt = transposeM(x.r);
  const o = applyM(rt, x.o);
  return { r: rt, o: [-o[0], -o[1], -o[2]] };
};

export const xfAt = (o: V3, r: M3 = IDENTITY): Xf => ({ o, r });

/** Rotation `r` about a pivot, followed by a translation. */
export function xfAbout(pivot: V3, r: M3, offset: V3 = [0, 0, 0]): Xf {
  const rp = applyM(r, pivot);
  return { r, o: add(sub(pivot, rp), offset) };
}

/**
 * Child bone: its rest frame sits `rest` from the parent's rest frame, its posed frame `posed` from
 * the parent's posed frame.
 */
export function childBone(parent: Bone, rest: Xf, posed: Xf): Bone {
  return { rest: xfMul(parent.rest, rest), posed: xfMul(parent.posed, posed) };
}

export const worldRoot: Bone = { rest: { o: [0, 0, 0], r: IDENTITY }, posed: { o: [0, 0, 0], r: IDENTITY } };
