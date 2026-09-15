/**
 * Input quality tiers.
 *
 * The same graph rendered and degraded five ways, sharing one truth file. That
 * separation is the point: graph difficulty is held constant across a tier, so
 * a score drop from `clean` to `photo` is attributable to image quality alone
 * rather than to the graph being harder.
 *
 * Averaging across tiers would hide the only finding that actually matters --
 * this will almost certainly work well on slides and badly on handwriting, and
 * that is a shippable answer as long as you know which is which.
 */
export type TierName = "clean" | "slide" | "photo" | "sketch" | "sketch-photo";

export interface Tier {
  name: TierName;
  /** Render the source SVG with hand-drawn jitter instead of clean strokes. */
  sketch: boolean;
  /** ImageMagick arguments applied to the rendered PNG. Empty = untouched. */
  degrade: (width: number, height: number) => string[];
  /**
   * False when the pipeline moves vertices (perspective warp), which makes the
   * truth's x/y no longer describe the image. Position error is suppressed for
   * those tiers rather than reported as a number that means nothing. Structural
   * scoring -- nodes, edges, weights -- is unaffected.
   */
  geometryPreserving: boolean;
  extension: "png" | "jpg";
  description: string;
}

/** Deterministic corner offsets, so a fixture's warp is identical run to run. */
function perspective(w: number, h: number): string[] {
  const dx = w * 0.035;
  const dy = h * 0.03;
  const src = [`0,0`, `${w},0`, `${w},${h}`, `0,${h}`];
  const dst = [
    `${dx * 0.9},${dy * 0.55}`,
    `${w - dx * 0.35},${dy * 1.25}`,
    `${w - dx * 1.1},${h - dy * 0.5}`,
    `${dx * 0.3},${h - dy * 1.15}`,
  ];
  return [
    "-alpha", "Set",
    "-virtual-pixel",
    "white",
    "-distort",
    "Perspective",
    src.map((s, i) => `${s} ${dst[i]}`).join("  "),
  ];
}

export const TIERS: Tier[] = [
  {
    name: "clean",
    sketch: false,
    degrade: () => [],
    geometryPreserving: true,
    extension: "png",
    description: "digital figure, PDF export, or a screenshot of a good slide",
  },
  {
    name: "slide",
    sketch: false,
    degrade: () => ["-resize", "68%", "-quality", "70"],
    geometryPreserving: true,
    extension: "jpg",
    description: "downscaled and JPEG-compressed, as a screenshotted slide arrives",
  },
  {
    name: "photo",
    sketch: false,
    degrade: (w, h) => [
      "-resize", "88%",
      ...perspective(w, h),
      "-blur", "0x0.7",
      // Uneven lighting: a soft diagonal shade, the way a phone photo of a
      // screen or page always picks one up.
      "-sigmoidal-contrast", "3,55%",
      "-modulate", "96,88,100",
      "-attenuate", "0.55", "+noise", "Gaussian",
      "-quality", "58",
    ],
    geometryPreserving: false,
    extension: "jpg",
    description: "phone photo of a screen or page: warped, blurred, noisy",
  },
  {
    name: "sketch",
    sketch: true,
    degrade: () => ["-quality", "88"],
    geometryPreserving: true,
    extension: "jpg",
    description: "hand-drawn, scanned flat and cleanly",
  },
  {
    name: "sketch-photo",
    sketch: true,
    degrade: (w, h) => [
      "-resize", "82%",
      ...perspective(w, h),
      "-blur", "0x0.9",
      "-sigmoidal-contrast", "4,52%",
      "-modulate", "94,85,100",
      "-attenuate", "0.7", "+noise", "Gaussian",
      "-quality", "52",
    ],
    geometryPreserving: false,
    extension: "jpg",
    description: "phone photo of a whiteboard or notebook -- the realistic worst case",
  },
];

export const TIER_BY_NAME = new Map(TIERS.map((t) => [t.name, t]));

/** "petersen.sketch-photo.jpg" -> { fixture: "petersen", tier: "sketch-photo" } */
export function parseImageName(file: string): { fixture: string; tier: TierName } | null {
  const match = /^(.+)\.([a-z-]+)\.(png|jpg)$/.exec(file);
  if (!match || !TIER_BY_NAME.has(match[2] as TierName)) return null;
  return { fixture: match[1]!, tier: match[2] as TierName };
}
