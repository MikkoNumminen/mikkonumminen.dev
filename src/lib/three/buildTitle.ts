import { type BufferAttribute, Group, Mesh, type MeshPhysicalMaterial } from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';

export interface TitleLetter {
  /** Per-character mesh. `userData.line` / `userData.charIndex` / `userData.char`
   *  are set so the click raycaster can identify which letter was hit. */
  mesh: Mesh;
  /** Character (e.g. "M"). */
  char: string;
  /** Index within the line, 0-based. */
  charIndex: number;
}

export interface TitleLine {
  /** Group wrapping the letters of this line. The line group is the unit
   *  that decor (mountain on M, ring on O) is parented under, so per-line
   *  responsive scaling and floats automatically apply to decor too. */
  group: Group;
  letters: TitleLetter[];
  /** Total typographic width of this line at scale=1. */
  width: number;
  /** Visible height of this line at scale=1. */
  height: number;
  /** y range of the visible glyphs in line-local space; used by
   *  per-letter flash effects to land highlights inside the letterforms. */
  yMin: number;
  yMax: number;
}

export interface TitleHandle {
  group: Group;
  lines: TitleLine[];
  material: MeshPhysicalMaterial;
  /** Total stacked height of all lines, used to vertically center the group. */
  totalHeight: number;
  /** Flat list of every letter mesh — convenience for dispose and for
   *  the interaction manager to register all letters in one pass. */
  allLetters: TitleLetter[];
}

export function loadFont(url: string): Promise<Font> {
  const loader = new FontLoader();
  return new Promise<Font>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

const SIZE = 2.2;
/** Extrusion depth of the title geometry. Exported so per-zone decor can
 * align to the midplane of the extruded letters. */
export const DEPTH = 0.7;
const CURVE_SEGMENTS = 12;
const BEVEL_THICKNESS = 0.09;
const BEVEL_SIZE = 0.07;
const BEVEL_SEGMENTS = 6;
const LINE_GAP = 0.6;

const TEXT_GEOMETRY_OPTS = {
  size: SIZE,
  depth: DEPTH,
  curveSegments: CURVE_SEGMENTS,
  bevelEnabled: true,
  bevelThickness: BEVEL_THICKNESS,
  bevelSize: BEVEL_SIZE,
  bevelSegments: BEVEL_SEGMENTS,
} as const;

/**
 * Width of `text` rendered with the same TextGeometry settings buildTitle
 * uses, so callers can compute world-space x ranges for substrings (e.g.
 * "where in MIKKO does the K-K sit") and place per-zone decor accordingly.
 * Disposes the throwaway geometry before returning.
 */
export function measureTextWidth(font: Font, text: string): number {
  if (text.length === 0) return 0;
  const geo = new TextGeometry(text, { font, ...TEXT_GEOMETRY_OPTS });
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const w = bb.max.x - bb.min.x;
  geo.dispose();
  return w;
}

/**
 * Three.js's `Font.data` is the parsed font JSON. We need each glyph's
 * horizontal advance (`ha`) to lay out per-character meshes with the same
 * spacing TextGeometry produces internally for a multi-character string.
 * The `FontLoader` type doesn't surface this in its public type, so we
 * cast through a minimal structural shape.
 */
interface FontDataShape {
  glyphs: Record<string, { ha: number } | undefined>;
  resolution: number;
}

function getGlyphAdvance(font: Font, char: string): number {
  const data = (font as unknown as { data: FontDataShape }).data;
  const glyph = data.glyphs[char];
  if (!glyph) {
    throw new Error(`buildTitle: font is missing glyph for '${char}'.`);
  }
  return (glyph.ha * SIZE) / data.resolution;
}

/**
 * Rewrite a single per-character geometry's UVs so they map into the
 * full LINE's bounding box. Without this each character's UV would span
 * [0, 1] across its own glyph, causing the four-world color gradient to
 * repeat at every letter instead of flowing across the whole line.
 *
 * `lineX` is the line-local x offset where this character's untranslated
 * vertices will sit — i.e. the cumulative advance from the start of the
 * line. The UV maps the world-space (line-local) vertex position into the
 * line's bbox so the gradient remains continuous letter to letter.
 */
function remapCharUVsToLineBBox(
  geometry: TextGeometry,
  lineX: number,
  lineBBMinX: number,
  lineBBMinY: number,
  lineWidth: number,
  lineHeight: number,
): void {
  const positions = geometry.attributes.position as BufferAttribute;
  const uvs = geometry.attributes.uv as BufferAttribute;
  for (let i = 0; i < uvs.count; i++) {
    const x = positions.getX(i) + lineX;
    const y = positions.getY(i);
    uvs.setXY(i, (x - lineBBMinX) / lineWidth, (y - lineBBMinY) / lineHeight);
  }
  uvs.needsUpdate = true;
}

/**
 * Build the title as a stack of lines. Each line is a Group of per-letter
 * Meshes sharing one material; the material's `map` (a horizontal
 * four-world gradient) flows continuously across every letter of a line
 * via the line-bbox UV remap below. Per-letter splitting exists so the
 * click-to-animate raycaster can identify which character was hit and
 * play a localised pop + ripple.
 *
 * Geometric layout uses each glyph's `ha` (horizontal advance) — the same
 * value `TextGeometry` uses internally when rendering a multi-character
 * string — so spacing is visually identical to the previous single-mesh
 * implementation.
 */
export function buildTitle(
  font: Font,
  title: string,
  material: MeshPhysicalMaterial,
): TitleHandle {
  const group = new Group();
  const lines: TitleLine[] = [];
  const allLetters: TitleLetter[] = [];
  const rawLines = title.split('\n');
  let lineY = 0;

  for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex++) {
    const lineText = rawLines[lineIndex]!;

    // Build a single full-line geometry once just to measure the line's
    // bounding box. Vertices are discarded after measurement — we only
    // use it for width/height and bbMinX/bbMinY in the UV remap below.
    const lineBBGeo = new TextGeometry(lineText, { font, ...TEXT_GEOMETRY_OPTS });
    lineBBGeo.computeBoundingBox();
    const lineBB = lineBBGeo.boundingBox!;
    const lineWidth = lineBB.max.x - lineBB.min.x;
    const lineHeight = lineBB.max.y - lineBB.min.y;
    const lineBBMinX = lineBB.min.x;
    const lineBBMinY = lineBB.min.y;
    lineBBGeo.dispose();

    const lineGroup = new Group();
    lineGroup.position.y = lineY;

    // Centering offset applied to every letter's mesh.position: shifts
    // the whole line so its untranslated bbox is centered on x=0, y=0.
    const lineDX = -lineWidth / 2 - lineBBMinX;
    const lineDY = -lineHeight / 2 - lineBBMinY;

    const letters: TitleLetter[] = [];
    let cursorX = 0; // line-local x where the next char's untranslated vertices will sit
    for (let i = 0; i < lineText.length; i++) {
      const ch = lineText[i]!;
      const advance = getGlyphAdvance(font, ch);

      // Space-like characters (no visible glyph) shouldn't produce a mesh.
      // The title doesn't currently use spaces, but defensive: only build
      // a mesh when the character has real geometry.
      const charGeo = new TextGeometry(ch, { font, ...TEXT_GEOMETRY_OPTS });
      charGeo.computeBoundingBox();
      const charBB = charGeo.boundingBox!;
      const charWidth = charBB.max.x - charBB.min.x;
      if (charWidth === 0) {
        charGeo.dispose();
        cursorX += advance;
        continue;
      }

      remapCharUVsToLineBBox(
        charGeo,
        cursorX,
        lineBBMinX,
        lineBBMinY,
        lineWidth,
        lineHeight,
      );

      const mesh = new Mesh(charGeo, material);
      mesh.position.set(cursorX + lineDX, lineDY, 0);
      mesh.userData.line = lineIndex;
      mesh.userData.charIndex = i;
      mesh.userData.char = ch;
      lineGroup.add(mesh);

      const letter: TitleLetter = { mesh, char: ch, charIndex: i };
      letters.push(letter);
      allLetters.push(letter);

      cursorX += advance;
    }

    group.add(lineGroup);
    lines.push({
      group: lineGroup,
      letters,
      width: lineWidth,
      height: lineHeight,
      yMin: lineBBMinY + lineDY,
      yMax: lineBB.max.y + lineDY,
    });

    lineY -= lineHeight + LINE_GAP;
  }

  const totalHeight = -lineY - LINE_GAP;
  group.position.y = totalHeight / 2;

  return { group, lines, material, totalHeight, allLetters };
}
