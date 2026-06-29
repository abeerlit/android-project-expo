/**
 * Meet-style remote gallery: pick column count from stage aspect ratio and participant count,
 * with a minimum short-edge so tiles stay tappable (e.g. 2-up side-by-side in landscape).
 */

export type RemoteGalleryLayoutInput = {
  stageWidth: number;
  stageHeight: number;
  remoteCount: number;
  padding: number;
  gap: number;
  /** Reject (soft) layouts where the smaller tile edge is below this when possible. */
  minTileShortEdge?: number;
};

export type RemoteGalleryLayoutResult = {
  columns: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
};

const DEFAULT_MIN_SHORT = 108;

/**
 * Target tile width/height ratio (w/h). Portrait stages use taller tiles; landscape prefers wider.
 */
const aspectTarget = (usableW: number, usableH: number): number => {
  const landscape = usableW >= usableH;
  return landscape ? 0.78 : 0.55;
};

export function computeRemoteGalleryLayout(
  input: RemoteGalleryLayoutInput
): RemoteGalleryLayoutResult {
  const {
    stageWidth,
    stageHeight,
    remoteCount,
    padding,
    gap,
    minTileShortEdge = DEFAULT_MIN_SHORT
  } = input;

  if (remoteCount <= 0 || stageWidth <= 0 || stageHeight <= 0) {
    return { columns: 1, rows: 1, tileWidth: 0, tileHeight: 0 };
  }

  const usableW = Math.max(0, stageWidth - padding * 2);
  const usableH = Math.max(0, stageHeight - padding * 2);
  const target = aspectTarget(usableW, usableH);
  const landscape = usableW >= usableH;

  const maxCols = Math.min(remoteCount, landscape ? 4 : 3);

  let best: RemoteGalleryLayoutResult | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let c = 1; c <= maxCols; c++) {
    const rows = Math.ceil(remoteCount / c);
    const tileW = Math.max(1, (usableW - gap * (c - 1)) / c);
    const maxRowH = Math.max(1, (usableH - gap * (rows - 1)) / rows);
    const idealH = tileW / target;
    const tileH = Math.min(maxRowH, idealH);
    const shortEdge = Math.min(tileW, tileH);
    const area = tileW * tileH;

    let score = shortEdge * 1_000_000 + area;
    if (shortEdge < minTileShortEdge) {
      score -= (minTileShortEdge - shortEdge) * 50_000;
    }
    // Prefer 2 columns for exactly 2 remotes in landscape (side-by-side).
    if (landscape && remoteCount === 2 && c === 2) {
      score += 250_000;
    }
    // Slight bias toward more columns in landscape for 3–4 users.
    if (landscape && remoteCount >= 3 && remoteCount <= 4 && c >= 2) {
      score += (c - 1) * 10_000;
    }

    if (score > bestScore) {
      bestScore = score;
      best = { columns: c, rows, tileWidth: tileW, tileHeight: tileH };
    }
  }

  if (!best) {
    const c = 1;
    const rows = remoteCount;
    const tileW = usableW;
    const maxRowH = Math.max(1, (usableH - gap * (rows - 1)) / rows);
    const tileH = Math.min(maxRowH, tileW / target);
    return { columns: c, rows, tileWidth: tileW, tileHeight: tileH };
  }

  return best;
}

