import { CLIP_TIMING, frameMs, shownFacings } from '../../../src/shared/clips';
import { FACING_COUNT, facingLabel, mirrorOf, parseFacing, type UnicornFacing } from '../../../src/shared/compass';
import { CLIP_NAMES, type ClipName } from '../../../src/shared/ids';
import { type Atlas, type Clip, facingKey, type Manifest, type UnicornAsset } from '../../../src/shared/manifest';
import { error, type Finding } from './finding';

/**
 * How far an attachment point may be from its turned position: they are rounded to a tenth of a
 * pixel.
 */
const TURN_TOLERANCE = 0.11;

/**
 * The gap the packer leaves round every picture, and the depth to which it repeats a picture's edge
 * pixels into it.
 */
const EDGE = 1;

type Bad = (message: string) => number;

/**
 * Every unicorn has exactly the clips and facings the timing contract lists, drawn at the
 * contract's timing, and a facing that is shown by flipping is a true flip of the facing that
 * mirrors it: the same pictures, the same timing, attachment points turned about the ground anchor.
 * The fine sheets hold exactly the facings the contract lists as fine, each clip whole on one
 * sheet. The simulation schedules by the contract and the view trusts the manifest, so a clip that
 * disagrees would show as a pose that does not match what she is doing. A character who wears a
 * crown has a place for it on every picture.
 */
export function checkUnicorns(manifest: Manifest): Finding[] {
  const found: Finding[] = [];
  const bad: Bad = (message) => found.push(error('unicorns', message));

  for (const [id, asset] of Object.entries(manifest.unicorns)) {
    const [originX] = asset.origin;
    checkSheet(asset.atlas, originX, `${id} first sheet`, bad);

    for (const name of CLIP_NAMES) {
      const timing = CLIP_TIMING[name];
      const byFacing = asset.clips[name];
      const expected = shownFacings(name);
      for (const facing of expected)
        if (!byFacing[facingKey(facing)]) bad(`${id} has no ${name} clip facing ${facingLabel(facing)}`);
      for (const key of Object.keys(byFacing)) {
        const facing = parseFacing(key);
        if (facing === undefined || !expected.includes(facing))
          bad(
            `${id} has a ${name} clip facing ${facing === undefined ? key : facingLabel(facing)}, which the timing contract does not list`,
          );
      }

      for (const facing of expected) {
        const clip = byFacing[facingKey(facing)];
        if (!clip) continue;
        const where = `${id} ${name} facing ${facingLabel(facing)}`;
        checkTiming(name, clip, where, bad);
        if (clip.frames.some((f) => f.rect >= asset.atlas.rects.length))
          bad(`${where} uses a picture the first sheet does not have`);

        const mirrors = timing.mirrored?.includes(facing) ? mirrorOf(facing) : null;
        if (mirrors === null) {
          if (clip.flip) bad(`${where} is marked flipped and is a facing the contract draws`);
          continue;
        }
        const source = byFacing[facingKey(mirrors)];
        if (!clip.flip) bad(`${where} should show ${facingLabel(mirrors)} flipped and is not marked flipped`);
        if (!source) continue;
        if (source.flip) bad(`${where} mirrors ${facingLabel(mirrors)}, which is itself flipped`);
        else checkTurned(clip, source, originX, where, bad);
      }
    }
    checkFine(id, asset, bad);
    checkCrown(id, asset, bad);
  }
  return found;
}

/**
 * A clip plays at the contract's rate and looping, covers a stride and releases on the frame it
 * says, and has the contract's frames held for the contract's times.
 */
function checkTiming(name: ClipName, clip: Clip, where: string, bad: Bad): void {
  const timing = CLIP_TIMING[name];
  if (clip.fps !== timing.fps || clip.loop !== timing.loop)
    bad(`${where} does not play at the contract's rate and looping`);
  if (clip.strideDistance !== timing.strideDistance)
    bad(
      `${where} has a stride distance of ${clip.strideDistance ?? 'none'} and the contract says ${timing.strideDistance ?? 'none'}`,
    );
  if (clip.releaseFrame !== timing.releaseFrame)
    bad(
      `${where} releases on frame ${clip.releaseFrame ?? 'none'} and the contract says ${timing.releaseFrame ?? 'none'}`,
    );
  if (clip.frames.length !== timing.frames)
    bad(`${where} has ${clip.frames.length} frames and the contract says ${timing.frames}`);
  else if (clip.frames.some((f, i) => f.ms !== frameMs(name, i)))
    bad(`${where} holds a frame for a time the contract does not give`);
}

/**
 * The pictures of a sheet fit inside it and inside their own canvases, none touches another or the
 * edge of the sheet closer than the edge pixels repeated round it, and every canvas is centered on
 * the ground anchor, because Phaser turns a trimmed frame about the middle of its source canvas and
 * a flipped facing would land beside her otherwise.
 */
function checkSheet(sheet: Atlas, originX: number, label: string, bad: Bad): void {
  if (sheet.rects.some((r) => r.sw !== originX * 2))
    bad(
      `${label} has a frame whose canvas is not centered on her ground anchor, so a flipped facing would land beside her`,
    );
  sheet.rects.forEach((r, i) => {
    if (r.x < EDGE || r.y < EDGE || r.x + r.w + EDGE > sheet.width || r.y + r.h + EDGE > sheet.height)
      bad(`${label} has picture ${i} too close to or past the edge of the sheet`);
    if (r.ox + r.w > r.sw || r.oy + r.h > r.sh) bad(`${label} has picture ${i} outside its own canvas`);
  });
  for (let i = 0; i < sheet.rects.length; i++) {
    const a = sheet.rects[i]!;
    for (let j = i + 1; j < sheet.rects.length; j++) {
      const b = sheet.rects[j]!;
      // Each picture owns the pixels round it to the depth of its repeated edge, so two pictures
      // must be at least twice that apart.
      if (
        a.x < b.x + b.w + 2 * EDGE &&
        b.x < a.x + a.w + 2 * EDGE &&
        a.y < b.y + b.h + 2 * EDGE &&
        b.y < a.y + a.h + 2 * EDGE
      )
        bad(`${label} has pictures ${i} and ${j} overlapping or too close together`);
    }
  }
}

function checkFine(id: string, asset: UnicornAsset, bad: Bad): void {
  const clips = CLIP_NAMES.filter((name) => CLIP_TIMING[name].fine);
  const fine = asset.fine;
  if (clips.length === 0) {
    if (fine) bad(`${id} has fine sheets and the timing contract lists no fine facings`);
    return;
  }
  if (!fine) {
    bad(`${id} has no fine sheets and the timing contract lists fine facings`);
    return;
  }
  fine.atlases.forEach((sheet, n) => {
    checkSheet(sheet, asset.origin[0], `${id} fine sheet ${n}`, bad);
  });
  const used = new Set<number>();
  for (const name of CLIP_NAMES) {
    const expected = CLIP_TIMING[name].fine ?? [];
    const byFacing = fine.clips[name] ?? {};
    for (const key of Object.keys(byFacing)) {
      const facing = parseFacing(key);
      if (facing === undefined || !expected.includes(facing))
        bad(
          `${id} has a fine ${name} clip facing ${facing === undefined ? key : facingLabel(facing)}, which the timing contract does not list`,
        );
    }
    for (const facing of expected) {
      const clip = byFacing[facingKey(facing)];
      const where = `${id} fine ${name} facing ${facingLabel(facing)}`;
      if (!clip) {
        bad(`${where} is missing`);
        continue;
      }
      checkTiming(name, clip, where, bad);
      if (clip.flip) bad(`${where} is marked flipped and the fine sheets hold only pictures drawn for the facing`);
      const sheet = fine.atlases[clip.page];
      if (!sheet) {
        bad(`${where} is on fine sheet ${clip.page} and there are ${fine.atlases.length}`);
        continue;
      }
      used.add(clip.page);
      if (clip.frames.some((f) => f.rect >= sheet.rects.length))
        bad(`${where} uses a picture fine sheet ${clip.page} does not have`);
    }
  }
  fine.atlases.forEach((_, n) => {
    if (!used.has(n)) bad(`${id} fine sheet ${n} is used by no clip, so it would be downloaded for nothing`);
  });
}

function checkTurned(clip: Clip, source: Clip, originX: number, where: string, bad: Bad): void {
  clip.frames.forEach((f, i) => {
    const s = source.frames[i];
    if (!s) return;
    if (f.rect !== s.rect || f.ms !== s.ms)
      bad(`${where} frame ${i} is not the picture and timing of the facing it mirrors`);
    if (
      s.crown &&
      f.crown &&
      (f.crown.view !== s.crown.view ||
        Math.abs(f.crown.at[0] - (2 * originX - s.crown.at[0])) > TURN_TOLERANCE ||
        Math.abs(f.crown.at[1] - s.crown.at[1]) > TURN_TOLERANCE ||
        f.crown.tilt !== -s.crown.tilt)
    )
      bad(`${where} frame ${i} has her crown somewhere other than turned about the ground anchor`);
    for (const [anchor, [sx, sy]] of Object.entries(s.anchors ?? {})) {
      const p = f.anchors?.[anchor];
      if (!p) bad(`${where} frame ${i} has no ${anchor} point`);
      else if (Math.abs(p[0] - (2 * originX - sx)) > TURN_TOLERANCE || Math.abs(p[1] - sy) > TURN_TOLERANCE)
        bad(`${where} frame ${i} has its ${anchor} point somewhere other than turned about the ground anchor`);
    }
  });
}

/**
 * Her crown is a view of it for each way she can face, and a place on every picture of her to lay
 * one: on the picture, leaning no more than a head can, and the view of the facing the picture is
 * drawn for. A picture that is a turned-over copy of another turns the crown over too, and the
 * views are checked against the facings that are drawn. A character with no crown has no places for
 * one.
 */
function checkCrown(id: string, asset: UnicornAsset, bad: Bad): void {
  const crown = asset.crown;
  const views = FACING_COUNT;
  if (crown) {
    if (crown.views.length !== views)
      bad(`${id} has ${crown.views.length} views of its crown and needs ${views}, one for each way she can face`);
    checkSheet(crown.atlas, crown.origin[0], `${id} crown sheet`, bad);
    if (crown.views.some((rect) => rect >= crown.atlas.rects.length))
      bad(`${id} lays a view of its crown that its sheet does not have`);
  }
  const check = (key: string, clip: Clip, sheet: Atlas, label: string): void => {
    const facing = parseFacing(key) as UnicornFacing;
    clip.frames.forEach((f, i) => {
      const where = `${label} facing ${facingLabel(facing)} frame ${i}`;
      if (!crown) {
        if (f.crown) bad(`${where} has a place for a crown and ${id} has none to lay`);
        return;
      }
      const ref = f.crown;
      if (!ref) {
        bad(`${where} has no place for her crown`);
        return;
      }
      const rect = sheet.rects[f.rect];
      if (
        rect &&
        (ref.at[0] < rect.ox - 4 ||
          ref.at[0] > rect.ox + rect.w + 4 ||
          ref.at[1] < rect.oy - 4 ||
          ref.at[1] > rect.oy + rect.h + 4)
      )
        bad(`${where} lays her crown at a point that is not on her`);
      if (!Number.isFinite(ref.tilt) || Math.abs(ref.tilt) > Math.PI / 2)
        bad(`${where} leans her crown further than a head can`);
      if (clip.flip === true ? ref.flip !== true : ref.view !== facing || ref.flip === true)
        bad(
          `${where} lays a view of her crown that is not the one for the picture, which is ${clip.flip === true ? 'turned over' : `drawn for the facing`}`,
        );
    });
  };
  for (const [name, byFacing] of Object.entries(asset.clips))
    for (const [key, clip] of Object.entries(byFacing)) check(key, clip, asset.atlas, `${id} ${name}`);
  for (const [name, byFacing] of Object.entries(asset.fine?.clips ?? {})) {
    for (const [key, clip] of Object.entries(byFacing)) {
      const sheet = asset.fine!.atlases[clip.page];
      if (sheet) check(key, clip, sheet, `${id} fine ${name}`);
    }
  }
}
