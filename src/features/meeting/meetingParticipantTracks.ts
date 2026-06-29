import { Platform } from "react-native";
import type { DailyParticipant } from "@daily-co/react-native-daily-js";
import type { MediaStreamTrack } from "@daily-co/react-native-webrtc";

/** Raised hand from `userData.hr` (same as web / participants list). */
export const participantHandRaised = (p: DailyParticipant | undefined): boolean =>
  !!(p?.userData as Record<string, unknown> | undefined)?.hr;

/** Display initials when camera is off (multi-word: first letter of up to 3 words). */
export const initialsFromUserName = (raw: string): string => {
  const name = raw.trim();
  if (!name) return "?";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => (w[0] ? w[0].toUpperCase() : ""))
      .join("");
  }
  return name.slice(0, 2).toUpperCase();
};

export const trackMediaLive = (
  track:
    | DailyParticipant["tracks"]["video"]
    | DailyParticipant["tracks"]["audio"]
    | undefined
): boolean => {
  if (!track) return false;
  const { state } = track;
  return (
    state === "playable" ||
    state === "loading" ||
    state === "sendable" ||
    state === "interrupted"
  );
};

/**
 * For screenVideo, Daily exposes both `track` and `persistentTrack`. Non-playable states
 * historically preferred `persistentTrack` first (Safari); on Android after remote stop,
 * that reference can be ended while the other is still live briefly — the layout gate
 * (which used `track ?? persistent` for liveness) stayed true but `DailyMediaView` got
 * a dead track and rendered an empty main stage. Prefer whichever is still `live`.
 */
/** Prefer a `MediaStreamTrack` that is still `live` (avoids transparent tiles on Android). */
function preferLiveMediaTrack(
  a: MediaStreamTrack | undefined | null,
  b: MediaStreamTrack | undefined | null
): MediaStreamTrack | null {
  if (a?.readyState === "live") return a;
  if (b?.readyState === "live") return b;
  return null;
}

export type DailyMediaZOrderRole = "stage" | "pip";

/**
 * Android `RTCView` stacking via `zOrder`.
 * - Remotes: `0` (background).
 * - Local on main stage: `1` (above remotes).
 * - PiP: no `zOrder` when solo; stacked PiP uses `zOrder: 1` via `LocalMeetingPiPMediaView`.
 * @see @daily-co/react-native-daily-js README
 */
export const dailyMediaViewZOrder = (
  local: boolean,
  role: DailyMediaZOrderRole = "stage"
): number | undefined => {
  if (Platform.OS !== "android") return undefined;
  if (role === "pip") return undefined;
  return local ? 1 : 0;
};

/**
 * Local PiP must only bind a live camera track. A stale `persistentTrack` with
 * `readyState === "ended"` leaves an empty SurfaceView (looks transparent) while
 * remote video shows through from lower z-order surfaces.
 */
export const getLocalCameraTrackForPiP = (
  participant: DailyParticipant | undefined
): MediaStreamTrack | null => {
  if (!participant?.local) return null;
  return getCameraTrackForTile(participant);
};

/**
 * MediaStream for DailyMediaView: prefer guaranteed-playable `track`, but when Daily
 * reports `loading` / `interrupted` / `sendable`, `persistentTrack` may still be set
 * (see DailyTrackState in daily-js types). Android often hits those after brief
 * background/foreground; only accepting `playable` made local tiles vanish.
 */
export const getPlayableTrack = (
  t: DailyParticipant["tracks"]["video"] | DailyParticipant["tracks"]["audio"] | undefined
): MediaStreamTrack | null => {
  if (!t || !trackMediaLive(t)) return null;
  const live = preferLiveMediaTrack(t.track, t.persistentTrack);
  if (live) return live;
  if (t.state === "playable") {
    return t.track ?? t.persistentTrack ?? null;
  }
  return null;
};

export const getVideoTrackForTile = (
  participant: DailyParticipant
): MediaStreamTrack | null => {
  const screen = participant.tracks?.screenVideo;
  if (screen && trackMediaLive(screen)) {
    const screenMedia = preferLiveMediaTrack(screen.track, screen.persistentTrack);
    if (screenMedia != null) return screenMedia;
    // Remote is starting screen share — avoid flashing camera in grid / main stage.
    if (participant.screen === true) return null;
  }
  return getPlayableTrack(participant.tracks?.video);
};

/**
 * Screen-share render track — live `MediaStreamTrack` only so Android never
 * binds a stale sink that flashes camera before the first screen keyframe.
 */
export const getScreenShareTrack = (
  participant: DailyParticipant | undefined
): MediaStreamTrack | null => {
  if (!participant) return null;
  const screen = participant.tracks?.screenVideo;
  if (!screen || !trackMediaLive(screen)) return null;
  return preferLiveMediaTrack(screen.track, screen.persistentTrack);
};

/**
 * Whether the UI should use the remote screen-share main stage layout.
 * Enter as soon as Daily reports an active share so the main pane can show black
 * until {@link getScreenShareTrack} binds — never camera in that slot.
 */
export const hasRemoteScreenShareForLayout = (p: DailyParticipant): boolean => {
  if (p.local) return false;
  const sv = p.tracks?.screenVideo;
  if (!sv || sv.state === "off" || sv.state === "blocked") return false;
  if (p.screen === false) return false;
  if (p.screen === true && trackMediaLive(sv)) return true;
  return getScreenShareTrack(p) != null;
};

export const getCameraTrackForTile = (
  participant: DailyParticipant
): MediaStreamTrack | null => {
  return getPlayableTrack(participant.tracks?.video);
};

/** Stable tile key segment when video turns on/off or track restarts. */
export const getTileVideoTrackId = (participant: DailyParticipant): string => {
  const track = getCameraTrackForTile(participant);
  return track?.id ?? participant.tracks?.video?.state ?? "off";
};

export const getAudioTrackForTile = (
  participant: DailyParticipant
): MediaStreamTrack | null => {
  return getPlayableTrack(participant.tracks?.audio);
};

/** Prefer roster entry; Daily sometimes omits `local` from `participants()` on Android. */
export const resolveLocalParticipant = (
  participants: DailyParticipant[],
  callLocal: DailyParticipant | undefined
): DailyParticipant | undefined => {
  const fromRoster = participants.find((p) => p.local);
  if (fromRoster) return fromRoster;
  if (callLocal) return callLocal;
  return undefined;
};

/** Stable key for PiP native clip refresh when remotes with video join or leave. */
export const buildPipClipRefreshKey = (
  participants: DailyParticipant[]
): string =>
  participants
    .filter((p) => !p.local && trackMediaLive(p.tracks?.video))
    .map((p) => `${p.session_id}:${p.tracks?.video?.state ?? "off"}`)
    .sort()
    .join("|");

