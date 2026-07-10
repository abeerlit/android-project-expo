import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Clipboard from "@react-native-clipboard/clipboard";
import {
  ActivityIndicator,
  Alert,
  AppState,
  InteractionManager,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useSelector } from "react-redux";
import Daily, {
  DailyCall,
  DailyEventObjectAppMessage,
  DailyEventObjectParticipant,
  DailyEventObjectParticipantLeft,
  DailyEventObjectTrack,
  DailyMediaView,
  DailyParticipant
} from "@daily-co/react-native-daily-js";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { useTheme } from "hooks/use-theme.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";
import { fontSize, padding } from "core/theme/theme.ts";
import {
  toast,
  ToastPosition
} from "@backpackapp-io/react-native-toast";
import { getMeetingRoom } from "shared/api/misc/get-meeting-room.ts";
import {
  DAILY_ROOM_BASE_URL,
  normalizeMeetRoomKey,
  parseRoomIdFromMeetVoxoUrl
} from "features/meeting/meetJoinUtils.ts";
import { Logger } from "shared/utils/Logger.ts";
import { State } from "store/types.ts";
import { MeetingParticipantsDrawer } from "features/meeting/components/MeetingParticipantsDrawer.tsx";
import { MeetingTranscriptionSheet } from "features/meeting/components/MeetingTranscriptionSheet.tsx";
import { MeetingChatSheet } from "features/meeting/components/MeetingChatSheet.tsx";
import {
  normalizeMeetingChatInbound,
  type MeetingChatMessage
} from "features/meeting/meetingChatProtocol.ts";
import { MeetingBottomControls } from "features/meeting/components/MeetingBottomControls.tsx";
import {
  MeetingReactionFloaters,
  type FloatingMeetingReaction
} from "features/meeting/components/MeetingReactionFloaters.tsx";
import {
  useMeetingActive,
  useMeetingTranscriptionLines
} from "features/meeting/MeetingActiveContext.tsx";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import {
  paramsMatchMeetingNav,
  type MeetingNavParams
} from "features/meeting/meetingActiveParams.ts";
import { computeRemoteGalleryLayout } from "features/meeting/layout/computeRemoteGalleryLayout.ts";
import { MeetingRemoteStage } from "features/meeting/components/MeetingRemoteStage.tsx";
import { MeetingTileContextMenu } from "features/meeting/components/MeetingTileContextMenu.tsx";
import { ScreenShareExpandedOverlay } from "features/meeting/components/ScreenShareExpandedOverlay.tsx";
import { MeetingInviteOthersDrawer } from "features/meeting/components/MeetingInviteOthersDrawer.tsx";
import { LocalMeetingPiPOverlay } from "features/meeting/components/LocalMeetingPiPOverlay.tsx";
import { MeetingTileMediaView } from "features/meeting/components/MeetingTileMediaView.tsx";
import { ScreenShareMainMediaView } from "features/meeting/components/ScreenShareMainMediaView.tsx";
import { MeetingSoloInvitePanel } from "features/meeting/components/MeetingSoloInvitePanel.tsx";
import {
  MEETING_BOTTOM_CONTROLS_ESTIMATE,
  MEETING_HEADER_HEIGHT
} from "features/meeting/meetingLayout.ts";
import {
  trackMediaLive,
  getVideoTrackForTile,
  getScreenShareTrack,
  getCameraTrackForTile,
  getAudioTrackForTile,
  resolveLocalParticipant,
  hasRemoteScreenShareForLayout,
  initialsFromUserName,
  participantHandRaised,
  buildPipClipRefreshKey
} from "features/meeting/meetingParticipantTracks.ts";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type MeetingsRoute = RouteProp<AuthParams, "Meetings">;

/**
 * Daily RN: in-call audio route. `"video"` uses speaker-style routing; `"voice"` uses receiver / phone-earpiece style.
 * Wired to native via `DailyNativeUtils.setAudioMode` (see `@daily-co/react-native-daily-js` `setupGlobals`).
 */
type DailyNativeInCallAudioMode = "video" | "voice";

type DailyCallWithNativeInCallAudio = DailyCall & {
  setNativeInCallAudioMode?: (mode: DailyNativeInCallAudioMode) => void;
  nativeInCallAudioMode?: () => DailyNativeInCallAudioMode;
};

const makeTranscriptionId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const normalizeMeetUrl = (meetURL?: string): string | null => {
  if (!meetURL?.trim()) return null;
  const trimmed = meetURL.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
};

/** Coerce API / route `enableTranscription` to 0 | 1 so UI checks stay reliable. */
const normalizeEnableTranscriptionFromApi = (
  raw: unknown
): number | undefined => {
  if (raw === undefined || raw === null) return undefined;
  if (raw === true || raw === "true" || raw === "1" || raw === 1) return 1;
  if (raw === false || raw === "false" || raw === "0" || raw === 0) return 0;
  const n = Number(raw);
  if (n === 1) return 1;
  if (n === 0) return 0;
  return undefined;
};

/** Daily: non-admins get this when the app calls startTranscription after join — expected, no user toast. */
const isIgnorableTranscriptionPermissionMessage = (raw: string): boolean => {
  const m = raw.toLowerCase();
  return (
    m.includes("transcription admin") || m.includes("must be transcription admin")
  );
};

const dialInNumFromRoomMeta = (meta: any): string | undefined => {
  return (
    (typeof meta?.dialInNum === "string" && meta.dialInNum.trim()) ||
    (typeof meta?.config?.dialin_number === "string" &&
      meta.config.dialin_number.trim()) ||
    undefined
  );
};

const pinFromRoomMeta = (meta: any): string | undefined => {
  return (
    (typeof meta?.pin === "string" && meta.pin.trim()) ||
    (typeof meta?.config?.dialin_code === "string" &&
      meta.config.dialin_code.trim()) ||
    undefined
  );
};


const mergeDailyParticipantsFromCall = (call: DailyCall): DailyParticipant[] => {
  const bySessionId = new Map<string, DailyParticipant>();
  for (const p of Object.values(call.participants() ?? {})) {
    if (p.session_id) {
      bySessionId.set(p.session_id, p);
    }
  }
  const local = call.participants()?.local;
  if (local?.session_id) {
    bySessionId.set(local.session_id, local);
  }
  return Array.from(bySessionId.values());
};

const REMOTE_GRID_GAP = 8;
const REMOTE_GRID_PADDING = 16;
const SCREEN_SHARE_RAIL_TILE_WIDTH = 108;
const SCREEN_SHARE_RAIL_TILE_HEIGHT =
  SCREEN_SHARE_RAIL_TILE_WIDTH / 0.65;
const SCREEN_SHARE_RAIL_MAX_VISIBLE = 4;
const SCREEN_SHARE_LANDSCAPE_GRID_MAX = 12;
const LANDSCAPE_SIDE_GRID_PAD = 8;
const PIN_MAX = 4;

const meetingParticipantDisplayName = (p: DailyParticipant | undefined) =>
  (p?.user_name || "Guest").trim() || "Guest";

const PARTICIPANT_JOIN_TOAST_ROSTER_GRACE_MS = 3200;
const PARTICIPANT_JOIN_TOAST_CONNECT_HOLD_MS = 90_000;

const meetingParticipantBwToast = (message: string) => {
  toast(message, {
    duration: 3400,
    position: ToastPosition.BOTTOM,
    styles: {
      pressable: { backgroundColor: "transparent" },
      view: {
        backgroundColor: "#0d0d0d",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.28)",
        borderRadius: 14
      },
      text: {
        color: "#fafafa",
        fontWeight: "600",
        fontSize: 15
      }
    }
  });
};

/** iOS `Modal` defaults to portrait-only; required for fullscreen screen-share to rotate. */
const SCREEN_SHARE_FULLSCREEN_MODAL_ORIENTATIONS = [
  "portrait",
  "landscape",
  "landscape-left",
  "landscape-right"
] as const;

/** Keep long-press layer from covering the maximize control (top-right). */
const SCREEN_SHARE_MAIN_MAXIMIZE_CLEAR_TOP = 48;
const SCREEN_SHARE_MAIN_MAXIMIZE_CLEAR_RIGHT = 52;
const SCREEN_SHARE_MAXIMIZE_BTN_SIZE = 44;
/** Android: black gate before inline main pane binds screen RTCView. */
const ANDROID_SCREEN_SHARE_INLINE_READY_MS = 180;
/** Android: delay before fullscreen overlay mounts screen RTCView. */
const ANDROID_SCREEN_SHARE_FULLSCREEN_READY_MS = 220;

type RemoteScreenShareMainPaneProps = {
  participant: DailyParticipant;
  containerStyle: StyleProp<ViewStyle>;
  floatingReactions: FloatingMeetingReaction[];
  onTileLongPress: (sessionId: string, pageX: number, pageY: number) => void;
  onMaximize: () => void;
  paneRef?: React.RefObject<View>;
  onPaneLayout?: () => void;
  /** Android: unmount video while fullscreen overlay owns the single track sink. */
  videoSuspended?: boolean;
  videoReady?: boolean;
  layoutEpoch?: number;
};

/**
 * Remote screen-share main stage. DailyMediaView uses zOrder 0 on Android so the
 * maximize control and long-press layer receive touches on first layout.
 */
const RemoteScreenShareMainPane = ({
  participant,
  containerStyle,
  floatingReactions,
  onTileLongPress,
  onMaximize,
  paneRef,
  onPaneLayout,
  videoSuspended = false,
  videoReady = true,
  layoutEpoch = 0
}: RemoteScreenShareMainPaneProps) => {
  const screenTrack = getScreenShareTrack(participant);
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const showScreenVideo = !videoSuspended;

  return (
  <View
    ref={paneRef}
    collapsable={false}
    onLayout={onPaneLayout}
    style={[containerStyle, styles.screenShareMainTouchHost]}
    pointerEvents="box-none"
  >
    <View
      style={styles.screenShareVideoClip}
      pointerEvents="box-none"
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setPaneSize((prev) =>
          prev.width === width && prev.height === height
            ? prev
            : { width, height }
        );
      }}
    >
      <View style={styles.screenShareMediaStack} pointerEvents="box-none">
        {showScreenVideo ? (
          <ScreenShareMainMediaView
            videoTrack={screenTrack}
            width={paneSize.width}
            height={paneSize.height}
            videoReady={videoReady}
            layoutEpoch={layoutEpoch}
            borderRadius={12}
          />
        ) : (
          <View style={styles.screenShareVideoPlaceholder} pointerEvents="none" />
        )}
      </View>
      <View style={styles.screenShareMainBadge} pointerEvents="none">
        <Text size={fontSize.xs} weight="medium" color="white">
          {(participant.user_name || "Guest") + " — Screen"}
        </Text>
      </View>
      <MeetingReactionFloaters
        variant="tile"
        items={floatingReactions.filter(
          (r) => r.fromSessionId === participant.session_id
        )}
      />
    </View>
    <View style={styles.screenShareControlsLayer} pointerEvents="box-none">
      <Pressable
        style={styles.screenShareMainLongPress}
        delayLongPress={480}
        onLongPress={(e) =>
          onTileLongPress(
            participant.session_id,
            e.nativeEvent.pageX,
            e.nativeEvent.pageY
          )
        }
      />
      {Platform.OS !== "android" ? (
        <Pressable
          style={styles.screenShareMainMaximize}
          onPress={onMaximize}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Fullscreen shared screen"
        >
          <Icon name="maximize-01" size={20} color="white" />
        </Pressable>
      ) : null}
    </View>
  </View>
  );
};

let androidLayoutAnimEnabled = false;

const configureMeetingPinLayoutAnimation = () => {
  if (Platform.OS === "android" && !androidLayoutAnimEnabled) {
    UIManager.setLayoutAnimationEnabledExperimental?.(true);
    androidLayoutAnimEnabled = true;
  }
  LayoutAnimation.configureNext({
    duration: 300,
    update: {
      type: LayoutAnimation.Types.easeInEaseOut
    },
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity
    }
  });
};

type ScreenShareStageRailCardProps = {
  item: DailyParticipant;
  remoteScreenSharer: DailyParticipant | null;
  activeSpeakerSessionId: string;
  participantsLength: number;
  floatingReactions: FloatingMeetingReaction[];
  noVideoBg: string;
  micMutedColor: string;
  onTileLongPress: (sessionId: string, pageX: number, pageY: number) => void;
  tileWrapperStyle: ViewStyle | ViewStyle[];
  tileWidth: number;
  tileHeight: number;
  layoutEpoch: number;
};

const ScreenShareStageRailCard = ({
  item,
  remoteScreenSharer,
  activeSpeakerSessionId,
  participantsLength,
  floatingReactions,
  noVideoBg,
  micMutedColor,
  onTileLongPress,
  tileWrapperStyle,
  tileWidth,
  tileHeight,
  layoutEpoch
}: ScreenShareStageRailCardProps) => {
  const videoTrack = getCameraTrackForTile(item);
  const hasVideo = videoTrack != null;
  const displayForInitials = item.user_name || "Guest";
  const initials = initialsFromUserName(displayForInitials);
  const showActiveSpeakerRing =
    item.session_id === activeSpeakerSessionId &&
    item.audio === true &&
    participantsLength > 1;
  const showMutedMic = item.audio !== true;
  const showHandRaised = participantHandRaised(item);
  const isScreenSharer =
    !!remoteScreenSharer && item.session_id === remoteScreenSharer.session_id;

  return (
    <View
      style={[
        tileWrapperStyle,
        showActiveSpeakerRing && {
          borderWidth: 2,
          borderColor: "#8ab4f8"
        }
      ]}
    >
      <MeetingTileMediaView
        videoTrack={videoTrack}
        audioTrack={getAudioTrackForTile(item)}
        mirror={item.local}
        local={item.local}
        objectFit="cover"
        width={tileWidth}
        height={tileHeight}
        layoutEpoch={layoutEpoch}
        borderRadius={12}
      />
      {!hasVideo ? (
        <View
          style={[styles.noVideoOverlay, { backgroundColor: noVideoBg }]}
          pointerEvents="none"
        >
          <View style={styles.initialsCircle}>
            <Text size={fontSize.lg} weight="semiBold" color="white">
              {initials}
            </Text>
          </View>
        </View>
      ) : null}
      {showHandRaised ? (
        <View style={styles.handRaisedPill} pointerEvents="none">
          <Icon name="hand" size={14} color="#8ab4f8" />
        </View>
      ) : null}
      {showMutedMic ? (
        <View style={styles.micPill} pointerEvents="none">
          <Icon
            name="microphone-off-02"
            size={14}
            color={micMutedColor}
          />
        </View>
      ) : null}
      {isScreenSharer ? (
        <View
          style={styles.screenShareSharerRailOverlay}
          pointerEvents="none"
          accessibilityElementsHidden
        >
          <Icon name="monitor-03" size={30} color="white" />
          <Text
            size={fontSize.xs}
            weight="semiBold"
            color="white"
            style={styles.screenShareSharerRailLabel}
          >
            Sharing screen
          </Text>
        </View>
      ) : null}
      <View style={styles.screenShareRailBadge}>
        <Text size={fontSize.xs} weight="medium" color="white">
          {item.user_name || "Guest"}
          {item.local ? " (You)" : ""}
        </Text>
      </View>
      <MeetingReactionFloaters
        compact
        variant="tile"
        items={floatingReactions.filter(
          (r) => r.fromSessionId === item.session_id
        )}
      />
      <Pressable
        style={styles.screenShareRailLongPress}
        delayLongPress={480}
        onLongPress={(e) =>
          onTileLongPress(
            item.session_id,
            e.nativeEvent.pageX,
            e.nativeEvent.pageY
          )
        }
      />
    </View>
  );
};

type ScreenShareLandscapeRightGridProps = {
  slots: DailyParticipant[];
  overflowMore: number;
  remoteScreenSharer: DailyParticipant | null;
  activeSpeakerSessionId: string;
  participantsLength: number;
  floatingReactions: FloatingMeetingReaction[];
  noVideoBg: string;
  micMutedColor: string;
  onTileLongPress: (sessionId: string, pageX: number, pageY: number) => void;
  layoutEpoch: number;
};

/**
 * Right half in landscape screen-share: 2-column grid (2+1, 2+2, …), cell size
 * shrinks as rows increase; optional "+N more" row when capped.
 */
const ScreenShareLandscapeRightGrid = ({
  slots,
  overflowMore,
  remoteScreenSharer,
  activeSpeakerSessionId,
  participantsLength,
  floatingReactions,
  noVideoBg,
  micMutedColor,
  onTileLongPress,
  layoutEpoch
}: ScreenShareLandscapeRightGridProps) => {
  const [box, setBox] = useState({ w: 0, h: 0 });

  const gridGeometry = useMemo(() => {
    const n = slots.length;
    if (n === 0) {
      return {
        cols: 1,
        tileW: 0,
        tileH: 0,
        rowChunks: [] as DailyParticipant[][]
      };
    }
    const cols = n <= 1 ? 1 : 2;
    const dataRows = Math.max(1, Math.ceil(n / cols));
    const overflowRow = overflowMore > 0 ? 1 : 0;
    const totalRows = dataRows + overflowRow;

    const innerW = box.w - LANDSCAPE_SIDE_GRID_PAD * 2;
    const innerH = box.h - LANDSCAPE_SIDE_GRID_PAD * 2;

    if (innerW < 8 || innerH < 8) {
      const rowChunks: DailyParticipant[][] = [];
      for (let i = 0; i < n; i += cols) {
        rowChunks.push(slots.slice(i, i + cols));
      }
      return { cols, tileW: 0, tileH: 0, rowChunks };
    }

    const rawH =
      (innerH - REMOTE_GRID_GAP * Math.max(0, totalRows - 1)) / totalRows;
    const rawW =
      (innerW - REMOTE_GRID_GAP * Math.max(0, cols - 1)) / cols;
    const tileH = Math.max(1, rawH);
    const tileW = Math.max(1, rawW);

    const rowChunks: DailyParticipant[][] = [];
    for (let i = 0; i < n; i += cols) {
      rowChunks.push(slots.slice(i, i + cols));
    }

    return { cols, tileW, tileH, rowChunks };
  }, [box.h, box.w, overflowMore, slots]);

  const baseTileStyle = useMemo(
    (): ViewStyle => ({
      width: gridGeometry.tileW,
      height: gridGeometry.tileH,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: "#0f172a",
      position: "relative"
    }),
    [gridGeometry.tileH, gridGeometry.tileW]
  );

  const overflowBandWidth =
    gridGeometry.cols * gridGeometry.tileW +
    Math.max(0, gridGeometry.cols - 1) * REMOTE_GRID_GAP;

  if (slots.length === 0) {
    return null;
  }

  return (
    <View
      style={styles.screenShareRailLandscapeColumn}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox((p) =>
          p.w === width && p.h === height ? p : { w: width, h: height }
        );
      }}
    >
      <View
        style={{
          flex: 1,
          minHeight: 0,
          padding: LANDSCAPE_SIDE_GRID_PAD,
          justifyContent: "center"
        }}
      >
        <View style={{ gap: REMOTE_GRID_GAP }}>
          {gridGeometry.rowChunks.map((row, rowIndex) => (
            <View
              key={row[0]?.session_id ?? `row-${rowIndex}`}
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: REMOTE_GRID_GAP,
                height: Math.max(gridGeometry.tileH, 1)
              }}
            >
              {row.map((item) => (
                <ScreenShareStageRailCard
                  key={`${item.session_id}-${layoutEpoch}`}
                  item={item}
                  remoteScreenSharer={remoteScreenSharer}
                  activeSpeakerSessionId={activeSpeakerSessionId}
                  participantsLength={participantsLength}
                  floatingReactions={floatingReactions}
                  noVideoBg={noVideoBg}
                  micMutedColor={micMutedColor}
                  onTileLongPress={onTileLongPress}
                  tileWrapperStyle={baseTileStyle}
                  tileWidth={gridGeometry.tileW}
                  tileHeight={gridGeometry.tileH}
                  layoutEpoch={layoutEpoch}
                />
              ))}
            </View>
          ))}
          {overflowMore > 0 && gridGeometry.tileH > 0 ? (
            <View
              style={{
                height: gridGeometry.tileH,
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <View
                style={[
                  styles.screenShareRailLandscapeOverflowTile,
                  {
                    width: overflowBandWidth,
                    height: gridGeometry.tileH
                  }
                ]}
              >
                <Text size={fontSize.md} weight="semiBold" color="white">
                  +{overflowMore}
                </Text>
                <Text
                  size={fontSize.xs}
                  weight="medium"
                  style={styles.screenShareRailOverflowSubLabel}
                >
                  more
                </Text>
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
};

export const Meetings = () => {
  const navigation = useNavigation();
  const route = useRoute<MeetingsRoute>();
  const theme = useTheme();
  const logger = useMemo(() => new Logger("Meetings"), []);
  const { openDrawer, closeDrawer } = useDrawer();
  const { accessToken } = useSelector((state: State) => state.authReducer);
  const { user } = useSelector((state: State) => state.userReducer);
  /** Match web `userStore.name`: human-facing `extName` for Daily `userName`, not SIP-style `peerName`. */
  const joinDisplayName = useMemo(() => {
    if (!user) return "User";
    const fromExt = user.extName?.trim();
    if (fromExt) return fromExt;
    const fromPeer = user.peerName?.trim();
    if (fromPeer) return fromPeer;
    const local = user.email?.split("@")[0]?.trim();
    return local || "User";
  }, [user]);

  /** Aligns with web `leavePreAuthAndJoinMeeting` userData (meet-helpers.ts). */
  const joinUserData = useMemo(() => {
    const tz =
      user?.timezone?.trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "";
    return {
      peerName: user?.peerName?.trim() || joinDisplayName,
      email: user?.email ?? "",
      timezone: tz,
      hr: false,
      id: user?.id ?? null
    };
  }, [user, joinDisplayName]);
  const {
    callRef,
    lastJoinedParamsRef,
    meetingActiveGlobally,
    setMeetingActiveGlobally,
    endMeetingGlobally
  } = useMeetingActive();
  const { transcriptionLines, setTranscriptionLines } =
    useMeetingTranscriptionLines();
  const intentLeaveRef = useRef(false);
  /** `Date.now()` threshold: skip join toasts while `now < this` (initial roster + connect). */
  const suppressParticipantJoinToastsUntilRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [participants, setParticipants] = useState<DailyParticipant[]>([]);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [meetingInviteMeta, setMeetingInviteMeta] = useState<{
    dialInNum?: string;
    pin?: string;
    roomId?: string;
    token?: string;
  } | null>(null);
  const [enableTranscription, setEnableTranscription] = useState<
    number | undefined
  >(() =>
    normalizeEnableTranscriptionFromApi(route.params.enableTranscription)
  );
  /** Daily listeners read this so we need not re-subscribe when room metadata updates `enableTranscription`. */
  const enableTranscriptionRef = useRef(enableTranscription);
  enableTranscriptionRef.current = enableTranscription;
  const [participantsDrawerVisible, setParticipantsDrawerVisible] =
    useState(false);
  const [meetingChatVisible, setMeetingChatVisible] = useState(false);
  /** Mirror `meetingChatVisible` for Daily app-message handler (avoid stale increment). */
  const meetingChatVisibleRef = useRef(false);
  /** Unread incoming chat messages while sheet closed (see web `meetStore.unreadMessageCount`). */
  const [meetingChatUnreadCount, setMeetingChatUnreadCount] = useState(0);
  const [meetingChatMessages, setMeetingChatMessages] = useState<
    MeetingChatMessage[]
  >([]);
  const [floatingReactions, setFloatingReactions] = useState<
    FloatingMeetingReaction[]
  >([]);
  const reactionRemovalTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const pushFloatingReactionRef = useRef<
    (emoji: string, fromSessionId: string) => void
  >(() => {});

  const clearFloatingReactionTimers = useCallback(() => {
    reactionRemovalTimersRef.current.forEach((t) => clearTimeout(t));
    reactionRemovalTimersRef.current.clear();
  }, []);

  const pushFloatingReaction = useCallback(
    (emoji: string, fromSessionId: string) => {
      const trimmed = emoji.trim();
      if (!trimmed || !fromSessionId) return;
      const id = makeTranscriptionId();
      setFloatingReactions((prev) => {
        for (const r of prev) {
          if (r.fromSessionId !== fromSessionId) continue;
          const t0 = reactionRemovalTimersRef.current.get(r.id);
          if (t0) {
            clearTimeout(t0);
            reactionRemovalTimersRef.current.delete(r.id);
          }
        }
        return [
          ...prev.filter((r) => r.fromSessionId !== fromSessionId),
          { id, emoji: trimmed, fromSessionId }
        ];
      });
      const t = setTimeout(() => {
        reactionRemovalTimersRef.current.delete(id);
        setFloatingReactions((prev) => prev.filter((x) => x.id !== id));
      }, 2800);
      reactionRemovalTimersRef.current.set(id, t);
    },
    []
  );

  useEffect(() => {
    pushFloatingReactionRef.current = pushFloatingReaction;
  }, [pushFloatingReaction]);

  useEffect(() => {
    meetingChatVisibleRef.current = meetingChatVisible;
  }, [meetingChatVisible]);

  /** Match web MeetChat panel: opening chat clears unread badge. */
  useEffect(() => {
    if (meetingChatVisible) {
      setMeetingChatUnreadCount(0);
    }
  }, [meetingChatVisible]);

  useEffect(() => {
    return () => {
      clearFloatingReactionTimers();
    };
  }, [clearFloatingReactionTimers]);

  /** `true` = Daily `"video"` mode (speaker-style output); `false` = `"voice"` (receiver-style). */
  const [meetingOutputSpeakerOn, setMeetingOutputSpeakerOn] = useState(true);
  const [transcriptSheetVisible, setTranscriptSheetVisible] = useState(false);
  const [transcriptionActive, setTranscriptionActive] = useState(false);
  const transcriptionInstanceIdRef = useRef<string | null>(null);
  /** Until user turns CC on, try to stop transcription as soon as Daily reports an instance (e.g. room auto-start). */
  const userPrefersTranscriptionOffRef = useRef(true);
  const [activeSpeakerSessionId, setActiveSpeakerSessionId] = useState("");
  const suppressNextTranscriptionStoppedToastRef = useRef(false);
  /** Cloud recording (Daily); `instanceId` for `stopRecording`. */
  const cloudRecordingInstanceIdRef = useRef<string | null>(null);
  const [meetingRecording, setMeetingRecording] = useState(false);
  const [meetingRecordingOwnerUserId, setMeetingRecordingOwnerUserId] =
    useState<string | null>(null);
  const meetingRecordingRef = useRef(false);
  const meetingRecordingOwnerUserIdRef = useRef<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [pinnedSessionIds, setPinnedSessionIds] = useState<string[]>([]);
  const [tileMenu, setTileMenu] = useState<{
    sessionId: string;
    pageX: number;
    pageY: number;
  } | null>(null);
  /** Fullscreen the **main shared screen** (not rail cameras). */
  const [screenShareMainMaximized, setScreenShareMainMaximized] =
    useState(false);
  /**
   * Android: bumps native tile clip after presentation transitions
   * (fullscreen open/close, screen track started).
   */
  const [meetingLayoutEpoch, setMeetingLayoutEpoch] = useState(0);
  /** Android: inline main pane black gate (share start / fullscreen close). */
  const [screenShareInlineVideoReady, setScreenShareInlineVideoReady] = useState(
    Platform.OS !== "android"
  );
  /** Android: fullscreen overlay black gate (fullscreen open). */
  const [screenShareFullscreenVideoReady, setScreenShareFullscreenVideoReady] =
    useState(Platform.OS !== "android");
  const screenShareInlineReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const screenShareFullscreenReadyTimerRef = useRef<
    ReturnType<typeof setTimeout> | null
  >(null);
  const stageRef = useRef<View>(null);
  const screenShareMainPaneRef = useRef<View>(null);
  const [screenShareMaximizeRect, setScreenShareMaximizeRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  /**
   * Android: roster / `hasRemoteScreenShareForLayout` can lag after remote stop. Set from
   * `track-stopped` (screenVideo) and from `participant-updated` when the sharer has
   * `screen === false` so we show the gallery until share clearly resumes.
   */
  const [suppressRemoteScreenShareStage, setSuppressRemoteScreenShareStage] =
    useState(false);
  const remoteScreenSharerSessionIdRef = useRef<string | null>(null);

  const meetURL = useMemo(
    () => normalizeMeetUrl(route.params?.meetURL),
    [route.params?.meetURL]
  );
  const paramRoomId = route.params?.roomId;
  const paramMeetingToken = route.params?.meetingToken;

  useEffect(() => {
    if (route.params.enableTranscription !== undefined) {
      setEnableTranscription(
        normalizeEnableTranscriptionFromApi(
          route.params.enableTranscription
        )
      );
    }
  }, [route.params.enableTranscription]);

  useEffect(() => {
    meetingRecordingRef.current = meetingRecording;
    meetingRecordingOwnerUserIdRef.current = meetingRecordingOwnerUserId;
  }, [meetingRecording, meetingRecordingOwnerUserId]);

  /** Global meeting ended (e.g. Leave from banner) while UI still shows joined. */
  useEffect(() => {
    if (meetingActiveGlobally || !joined) return;
    const call = callRef.current;
    if (call && !call.isDestroyed()) {
      if (call.meetingState() === "joined-meeting") {
        setMeetingActiveGlobally(true);
        return;
      }
    }
    if (joining || loading) return;
    setJoined(false);
    setJoining(false);
    setLoading(false);
    setParticipants([]);
    setTranscriptionActive(false);
    transcriptionInstanceIdRef.current = null;
    userPrefersTranscriptionOffRef.current = true;
    setTranscriptionLines([]);
    setErrorText(null);
    setAudioOn(true);
    setVideoOn(true);
    setMeetingOutputSpeakerOn(true);
    setMeetingChatVisible(false);
    setMeetingChatMessages([]);
    setMeetingChatUnreadCount(0);
    clearFloatingReactionTimers();
    setFloatingReactions([]);
    setPinnedSessionIds([]);
    setScreenShareMainMaximized(false);
    setMeetingLayoutEpoch(0);
    setScreenShareInlineVideoReady(Platform.OS !== "android");
    setScreenShareFullscreenVideoReady(Platform.OS !== "android");
    if (screenShareInlineReadyTimerRef.current != null) {
      clearTimeout(screenShareInlineReadyTimerRef.current);
      screenShareInlineReadyTimerRef.current = null;
    }
    if (screenShareFullscreenReadyTimerRef.current != null) {
      clearTimeout(screenShareFullscreenReadyTimerRef.current);
      screenShareFullscreenReadyTimerRef.current = null;
    }
    setTileMenu(null);
    setMeetingRecording(false);
    setMeetingRecordingOwnerUserId(null);
    cloudRecordingInstanceIdRef.current = null;
    setSuppressRemoteScreenShareStage(false);
  }, [
    joined,
    meetingActiveGlobally,
    joining,
    loading,
    clearFloatingReactionTimers
  ]);

  const localParticipant = useMemo(() => {
    const call = callRef.current;
    const callLocal =
      call && !call.isDestroyed() ? call.participants()?.local : undefined;
    return resolveLocalParticipant(participants, callLocal);
  }, [participants, joined]);
  const remoteParticipants = useMemo(() => {
    const localSid = localParticipant?.session_id;
    return participants.filter(
      (p) =>
        !p.local && (localSid == null || p.session_id !== localSid)
    );
  }, [localParticipant?.session_id, participants]);

  /** First remote participant actively screen sharing (web-style main stage). */
  const remoteScreenSharer = useMemo(
    () => participants.find((p) => hasRemoteScreenShareForLayout(p)) ?? null,
    [participants]
  );

  useEffect(() => {
    remoteScreenSharerSessionIdRef.current = remoteScreenSharer?.session_id ?? null;
  }, [remoteScreenSharer]);

  const gridParticipants = remoteParticipants;

  const sortedGridParticipants = useMemo(
    () =>
      [...remoteParticipants].sort((a, b) =>
        a.session_id.localeCompare(b.session_id)
      ),
    [remoteParticipants]
  );

  const effectiveStage = useMemo(() => {
    const w =
      stageSize.width > 0 ? stageSize.width : Math.max(1, windowWidth);
    const h =
      stageSize.height > 0
        ? stageSize.height
        : Math.max(
            180,
            windowHeight - MEETING_HEADER_HEIGHT - MEETING_BOTTOM_CONTROLS_ESTIMATE
          );
    return { width: w, height: h };
  }, [stageSize.height, stageSize.width, windowHeight, windowWidth]);

  const isLandscapeLayout = useMemo(
    () => effectiveStage.width >= effectiveStage.height,
    [effectiveStage.height, effectiveStage.width]
  );

  const galleryLayout = useMemo(
    () =>
      computeRemoteGalleryLayout({
        stageWidth: effectiveStage.width,
        stageHeight: effectiveStage.height,
        remoteCount: gridParticipants.length,
        padding: REMOTE_GRID_PADDING,
        gap: REMOTE_GRID_GAP,
        minTileShortEdge: 108
      }),
    [effectiveStage.height, effectiveStage.width, gridParticipants.length]
  );

  const gridColumns = galleryLayout.columns;
  const gridRows = galleryLayout.rows;
  const gridTileWidth = galleryLayout.tileWidth;
  const gridTileHeight = galleryLayout.tileHeight;

  useEffect(() => {
    const valid = new Set(gridParticipants.map((p) => p.session_id));
    setPinnedSessionIds((prev) => prev.filter((id) => valid.has(id)));
  }, [gridParticipants]);

  const localScreenSharing = !!localParticipant?.screen;
  const localHandRaise = !!(
    localParticipant?.userData as Record<string, unknown> | undefined
  )?.hr;

  const showTranscriptionButton = useMemo(() => {
    if (enableTranscription === 0) return false;
    return (
      enableTranscription === 1 ||
      transcriptionActive ||
      transcriptionLines.length > 0
    );
  }, [
    enableTranscription,
    transcriptionActive,
    transcriptionLines.length
  ]);

  const meetingChatMessagesSorted = useMemo(
    () => [...meetingChatMessages].sort((a, b) => a.ts - b.ts),
    [meetingChatMessages]
  );

  /** Full URL for copy / share (meet link). */
  const inviteLinkToCopy = useMemo(() => {
    if (!meetURL) return "";
    const t = meetURL.trim();
    if (t.startsWith("http://") || t.startsWith("https://")) return t;
    return `https://${t}`;
  }, [meetURL]);

  /** User-visible link line (host + path, no scheme). */
  const inviteLinkDisplay = useMemo(() => {
    if (!inviteLinkToCopy) return "";
    try {
      const u = new URL(inviteLinkToCopy);
      return `${u.host}${u.pathname}${u.search}`.replace(/\/$/, "") || inviteLinkToCopy;
    } catch {
      return inviteLinkToCopy.replace(/^https?:\/\//i, "");
    }
  }, [inviteLinkToCopy]);

  const soloInMeeting =
    joined &&
    !loading &&
    !errorText &&
    participants.length === 1;

  const showRemoteScreenShareLayout =
    joined &&
    !loading &&
    !errorText &&
    !soloInMeeting &&
    remoteScreenSharer != null &&
    !suppressRemoteScreenShareStage;

  useEffect(() => {
    if (remoteScreenSharer == null) {
      setSuppressRemoteScreenShareStage(false);
    }
  }, [remoteScreenSharer]);

  useEffect(() => {
    if (!showRemoteScreenShareLayout) {
      setScreenShareMainMaximized(false);
    }
  }, [showRemoteScreenShareLayout]);

  const bumpMeetingLayoutEpoch = useCallback(() => {
    setMeetingLayoutEpoch((epoch) => epoch + 1);
  }, []);

  const armScreenShareInlineVideoReady = useCallback(() => {
    if (Platform.OS !== "android") {
      setScreenShareInlineVideoReady(true);
      return;
    }
    setScreenShareInlineVideoReady(false);
    if (screenShareInlineReadyTimerRef.current != null) {
      clearTimeout(screenShareInlineReadyTimerRef.current);
    }
    screenShareInlineReadyTimerRef.current = setTimeout(() => {
      screenShareInlineReadyTimerRef.current = null;
      setScreenShareInlineVideoReady(true);
    }, ANDROID_SCREEN_SHARE_INLINE_READY_MS);
  }, []);

  const armScreenShareFullscreenVideoReady = useCallback(() => {
    if (Platform.OS !== "android") {
      setScreenShareFullscreenVideoReady(true);
      return;
    }
    setScreenShareFullscreenVideoReady(false);
    if (screenShareFullscreenReadyTimerRef.current != null) {
      clearTimeout(screenShareFullscreenReadyTimerRef.current);
    }
    screenShareFullscreenReadyTimerRef.current = setTimeout(() => {
      screenShareFullscreenReadyTimerRef.current = null;
      setScreenShareFullscreenVideoReady(true);
    }, ANDROID_SCREEN_SHARE_FULLSCREEN_READY_MS);
  }, []);

  useEffect(() => {
    if (showRemoteScreenShareLayout && Platform.OS === "android") {
      armScreenShareInlineVideoReady();
    } else if (!showRemoteScreenShareLayout) {
      setScreenShareInlineVideoReady(false);
      setScreenShareFullscreenVideoReady(false);
      if (screenShareInlineReadyTimerRef.current != null) {
        clearTimeout(screenShareInlineReadyTimerRef.current);
        screenShareInlineReadyTimerRef.current = null;
      }
      if (screenShareFullscreenReadyTimerRef.current != null) {
        clearTimeout(screenShareFullscreenReadyTimerRef.current);
        screenShareFullscreenReadyTimerRef.current = null;
      }
    }
  }, [armScreenShareInlineVideoReady, showRemoteScreenShareLayout]);

  useEffect(
    () => () => {
      if (screenShareInlineReadyTimerRef.current != null) {
        clearTimeout(screenShareInlineReadyTimerRef.current);
      }
      if (screenShareFullscreenReadyTimerRef.current != null) {
        clearTimeout(screenShareFullscreenReadyTimerRef.current);
      }
    },
    []
  );

  /** Only one native sink owns screenVideo: inline main pane OR fullscreen overlay. */
  const screenShareMainVideoSuspended = screenShareMainMaximized;

  const openScreenShareFullscreen = useCallback(() => {
    setScreenShareFullscreenVideoReady(false);
    setScreenShareMainMaximized(true);
    if (Platform.OS === "android") {
      bumpMeetingLayoutEpoch();
      armScreenShareFullscreenVideoReady();
    }
  }, [armScreenShareFullscreenVideoReady, bumpMeetingLayoutEpoch]);

  const closeScreenShareFullscreen = useCallback(() => {
    setScreenShareMainMaximized(false);
    setScreenShareFullscreenVideoReady(false);
    if (Platform.OS === "android") {
      bumpMeetingLayoutEpoch();
      armScreenShareInlineVideoReady();
    }
  }, [armScreenShareInlineVideoReady, bumpMeetingLayoutEpoch]);

  const updateScreenShareMaximizeRect = useCallback(() => {
    if (Platform.OS !== "android") {
      return;
    }
    const pane = screenShareMainPaneRef.current;
    const stage = stageRef.current;
    if (!pane || !stage || !showRemoteScreenShareLayout || screenShareMainMaximized) {
      setScreenShareMaximizeRect(null);
      return;
    }
    pane.measureLayout(
      stage,
      (x, y, width) => {
        if (width < 16) {
          setScreenShareMaximizeRect(null);
          return;
        }
        setScreenShareMaximizeRect({
          top: y + 8,
          left: x + width - SCREEN_SHARE_MAXIMIZE_BTN_SIZE - 8,
          width: SCREEN_SHARE_MAXIMIZE_BTN_SIZE,
          height: SCREEN_SHARE_MAXIMIZE_BTN_SIZE
        });
      },
      () => setScreenShareMaximizeRect(null)
    );
  }, [screenShareMainMaximized, showRemoteScreenShareLayout]);

  const updateScreenShareMaximizeRectRef = useRef(updateScreenShareMaximizeRect);
  updateScreenShareMaximizeRectRef.current = updateScreenShareMaximizeRect;

  const scheduleScreenShareMaximizeMeasure = useCallback(() => {
    if (Platform.OS !== "android") return;
    const run = () => updateScreenShareMaximizeRectRef.current();
    requestAnimationFrame(run);
    setTimeout(run, 100);
    setTimeout(run, 400);
  }, []);

  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      !showRemoteScreenShareLayout ||
      screenShareMainMaximized
    ) {
      setScreenShareMaximizeRect(null);
      return;
    }
    scheduleScreenShareMaximizeMeasure();
    const interaction = InteractionManager.runAfterInteractions(() =>
      updateScreenShareMaximizeRectRef.current()
    );
    return () => {
      interaction.cancel();
    };
  }, [
    isLandscapeLayout,
    meetingLayoutEpoch,
    remoteScreenSharer?.session_id,
    screenShareMainMaximized,
    showRemoteScreenShareLayout,
    stageSize.height,
    stageSize.width,
    scheduleScreenShareMaximizeMeasure
  ]);

  const screenShareRailParticipants = useMemo(() => {
    const sharerId = remoteScreenSharer?.session_id;
    const sharer = sharerId
      ? participants.find((p) => p.session_id === sharerId)
      : undefined;
    // Local is PiP in portrait; in landscape screen-share they join the right column instead.
    // Everyone else (including the sharer) appears in the rail; sharer is first so they are
    // not dropped when the rail truncates.
    const others = participants.filter((p) => !p.local && p.session_id !== sharerId);

    const score = (p: DailyParticipant) => {
      let s = 0;
      if (p.session_id === activeSpeakerSessionId && p.audio === true) {
        s += 100;
      }
      if (p.local) s += 10;
      return s;
    };

    const sortedOthers = [...others].sort((a, b) => score(b) - score(a));
    return sharer ? [sharer, ...sortedOthers] : sortedOthers;
  }, [activeSpeakerSessionId, participants, remoteScreenSharer?.session_id]);

  const screenShareRailVisible = useMemo(
    () => screenShareRailParticipants.slice(0, SCREEN_SHARE_RAIL_MAX_VISIBLE),
    [screenShareRailParticipants]
  );

  const screenShareRailOverflow = Math.max(
    0,
    screenShareRailParticipants.length - screenShareRailVisible.length
  );

  /** Landscape screen-share: rail + local (PiP is hidden; local stacks on the right). */
  const screenShareLandscapeSideAll = useMemo(() => {
    const tiles = [...screenShareRailParticipants];
    if (
      localParticipant &&
      !tiles.some((p) => p.session_id === localParticipant.session_id)
    ) {
      tiles.push(localParticipant);
    }
    return tiles;
  }, [localParticipant, screenShareRailParticipants]);

  const screenShareLandscapeGridParticipants = useMemo(
    () => screenShareLandscapeSideAll.slice(0, SCREEN_SHARE_LANDSCAPE_GRID_MAX),
    [screenShareLandscapeSideAll]
  );

  const screenShareLandscapeGridOverflow = Math.max(
    0,
    screenShareLandscapeSideAll.length - screenShareLandscapeGridParticipants.length
  );

  const showLocalPiP =
    joined &&
    !loading &&
    !!localParticipant &&
    !(showRemoteScreenShareLayout && isLandscapeLayout);

  const stageBranch = useMemo(():
    | "error"
    | "solo"
    | "screenShare"
    | "grid" => {
    if (errorText) return "error";
    if (soloInMeeting) return "solo";
    if (showRemoteScreenShareLayout) return "screenShare";
    return "grid";
  }, [errorText, soloInMeeting, showRemoteScreenShareLayout]);

  const pipRemotesPresent = remoteParticipants.length > 0;
  const pipClipRefreshKey = useMemo(
    () => buildPipClipRefreshKey(gridParticipants),
    [gridParticipants]
  );

  useEffect(() => {
    logger.debug("stage layout", {
      joined,
      loading,
      joining,
      soloInMeeting,
      showLocalPiP,
      hasLocal: !!localParticipant,
      localSessionId: localParticipant?.session_id ?? null,
      participants: participants.length,
      gridRemotes: gridParticipants.length,
      pipRemotesPresent,
      branch: stageBranch,
      stageSize
    });
  }, [
    gridParticipants.length,
    joining,
    loading,
    joined,
    localParticipant?.session_id,
    logger,
    participants.length,
    pipRemotesPresent,
    showLocalPiP,
    soloInMeeting,
    stageBranch,
    stageSize.height,
    stageSize.width
  ]);

  const onTileLongPress = useCallback(
    (sessionId: string, pageX: number, pageY: number) => {
      setTileMenu({ sessionId, pageX, pageY });
    },
    []
  );

  const tileMenuMeta = useMemo(() => {
    if (!tileMenu) {
      return { isPinned: false, canPin: false, pinBlocked: false };
    }
    const isPinned = pinnedSessionIds.includes(tileMenu.sessionId);
    const isRemote = gridParticipants.some(
      (p) => p.session_id === tileMenu.sessionId
    );
    const pinBlocked =
      isRemote && !isPinned && pinnedSessionIds.length >= PIN_MAX;
    const canPin =
      isRemote && !isPinned && pinnedSessionIds.length < PIN_MAX;
    return { isPinned, canPin, pinBlocked };
  }, [gridParticipants, pinnedSessionIds, tileMenu]);

  const handleMenuPin = useCallback(() => {
    if (!tileMenu) return;
    configureMeetingPinLayoutAnimation();
    setPinnedSessionIds((prev) => {
      if (prev.includes(tileMenu.sessionId)) return prev;
      if (prev.length >= PIN_MAX) return prev;
      return [...prev, tileMenu.sessionId];
    });
  }, [tileMenu]);

  const handleMenuUnpin = useCallback(() => {
    if (!tileMenu) return;
    configureMeetingPinLayoutAnimation();
    setPinnedSessionIds((prev) => prev.filter((x) => x !== tileMenu.sessionId));
  }, [tileMenu]);

  const copyInviteLink = useCallback(() => {
    if (!inviteLinkToCopy) return;
    void Clipboard.setString(inviteLinkToCopy);
    toast.success("Meeting link copied");
  }, [inviteLinkToCopy]);

  const shareInviteLink = useCallback(async () => {
    if (!inviteLinkToCopy) return;
    try {
      await Share.share({
        title: "Meeting invite",
        message: `Join my meeting\n${inviteLinkToCopy}`,
        url: inviteLinkToCopy
      });
    } catch {
      // user dismissed share sheet
    }
  }, [inviteLinkToCopy]);

  /** Updates tiles + mute/cam icons from Daily (call after participant events). */
  const refreshParticipants = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setParticipants(mergeDailyParticipantsFromCall(call));
    const local = call.participants()?.local;
    if (local?.tracks) {
      setVideoOn(trackMediaLive(local.tracks.video));
      setAudioOn(trackMediaLive(local.tracks.audio));
    }
  }, []);

  /** Only refresh the participant list (toolbar state unchanged — use with optimistic toggles). */
  const refreshParticipantTilesOnly = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setParticipants(mergeDailyParticipantsFromCall(call));
  }, []);

  // Same as Android: brief post-join window where Daily has no `local` in the roster yet.
  useEffect(() => {
    if (!joined || loading) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let rafId = 0;

    const maxAttempts = 20;
    const intervalMs = 100;

    const runTick = (attempt: number) => {
      if (cancelled) return;
      refreshParticipants();
      const call = callRef.current;
      if (!call || call.isDestroyed() || cancelled) return;
      const hasLocal = !!call.participants()?.local;
      if (hasLocal || attempt >= maxAttempts - 1) return;
      timeoutId = setTimeout(() => runTick(attempt + 1), intervalMs);
    };

    rafId = requestAnimationFrame(() => {
      if (!cancelled) runTick(0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [joined, loading, refreshParticipants]);

  /** After camera/mic permission sheets (activity background), sync UI like banner reuse. */
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        return;
      }
      if (!joined && !joining) {
        return;
      }

      const call = callRef.current;
      if (call && !call.isDestroyed() && call.meetingState() === "joined-meeting") {
        setJoined(true);
        setJoining(false);
        setLoading(false);
      }

      refreshParticipants();
    });

    return () => sub.remove();
  }, [callRef, joined, joining, refreshParticipants]);

  const minimizeMeeting = useCallback(() => {
    intentLeaveRef.current = false;
    navigation.goBack();
  }, [navigation]);

  const promptLeaveMeeting = useCallback(() => {
    Alert.alert(
      "Leave meeting?",
      "You will disconnect from this meeting.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Leave",
          style: "destructive",
          onPress: () => {
            intentLeaveRef.current = true;
            navigation.goBack();
          }
        }
      ]
    );
  }, [navigation]);

  const toggleAudio = useCallback(() => {
    const call = callRef.current;
    if (!call || !joined) return;
    const next = !audioOn;
    call.setLocalAudio(next);
    setAudioOn(next);
    refreshParticipantTilesOnly();
  }, [audioOn, joined, refreshParticipantTilesOnly]);

  const toggleVideo = useCallback(() => {
    const call = callRef.current;
    if (!call || !joined) return;
    const next = !videoOn;
    call.setLocalVideo(next);
    setVideoOn(next);
    refreshParticipantTilesOnly();
  }, [joined, refreshParticipantTilesOnly, videoOn]);

  const toggleScreenShare = useCallback(() => {
    const call = callRef.current;
    if (!call || !joined) return;
    const local = call.participants()?.local;
    try {
      if (local?.screen) {
        call.stopScreenShare();
      } else {
        call.startScreenShare();
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Screen share failed";
      toast.error(message);
    }
    refreshParticipantTilesOnly();
  }, [joined, refreshParticipantTilesOnly]);

  const toggleRaiseHand = useCallback(async () => {
    const call = callRef.current;
    if (!call || !joined) return;
    const local = call.participants()?.local;
    const raw = local?.userData;
    const prev =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? { ...(raw as Record<string, unknown>) }
        : {};
    const raised = prev.hr === true;
    try {
      if (raised) {
        delete prev.hr;
        await call.setUserData(prev);
      } else {
        await call.setUserData({ ...prev, hr: true });
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Could not update hand raise";
      toast.error(message);
    }
    refreshParticipantTilesOnly();
  }, [joined, refreshParticipantTilesOnly]);

  const sendReaction = useCallback(
    (emoji: string) => {
      const call = callRef.current;
      if (!call || !joined) return;
      const localId = call.participants()?.local?.session_id;
      if (!localId) return;
      try {
        call.sendAppMessage({
          action: "reaction",
          title: emoji,
          user_id: localId
        });
        pushFloatingReaction(emoji, localId);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Could not send reaction";
        toast.error(message);
      }
    },
    [joined, pushFloatingReaction]
  );

  const sendMeetingChat = useCallback(
    (text: string) => {
      const call = callRef.current;
      if (!call || call.isDestroyed() || !joined) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      const localId = call.participants()?.local?.session_id;
      if (!localId) return;
      const id = makeTranscriptionId();
      const ts = Date.now();
      const dateIso = new Date(ts).toISOString();
      // Match web `MeetChat.vue` + `meet-helpers` handleNewMessage: `event === "chat-msg"` and nested `data`.
      const payload = {
        event: "chat-msg" as const,
        data: {
          message: trimmed,
          name: joinDisplayName,
          date: dateIso
        },
        clientMessageId: id,
        ts,
        user_id: localId
      };
      try {
        call.sendAppMessage(payload, "*");
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Could not send chat message";
        toast.error(message);
        return;
      }
      setMeetingChatMessages((prev) => {
        if (prev.some((m) => m.id === id)) return prev;
        return [
          ...prev,
          {
            id,
            fromSessionId: localId,
            senderName: "You",
            text: trimmed,
            ts
          }
        ];
      });
    },
    [callRef, joinDisplayName, joined]
  );

  const toggleMeetingRecording = useCallback(() => {
    const call = callRef.current;
    if (!call || !joined || call.isDestroyed()) return;
    const local = call.participants()?.local;
    const uid = local?.user_id?.trim();
    if (!uid) {
      toast.error("Recording is not available yet.");
      return;
    }

    if (meetingRecording) {
      if (meetingRecordingOwnerUserId !== uid) {
        toast.error("Only the person who started recording can stop it.");
        return;
      }
      try {
        const iid = cloudRecordingInstanceIdRef.current;
        if (iid) {
          call.stopRecording({ instanceId: iid });
        } else {
          call.stopRecording();
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Could not stop recording";
        toast.error(message);
        return;
      }
      setMeetingRecording(false);
      setMeetingRecordingOwnerUserId(null);
      cloudRecordingInstanceIdRef.current = null;
      try {
        call.sendAppMessage({ action: "recording-stopped", user_id: uid }, "*");
      } catch {
        // ignore
      }
      toast.success("Recording stopped");
      return;
    }

    setMeetingRecording(true);
    setMeetingRecordingOwnerUserId(uid);
    try {
      call.startRecording();
      call.sendAppMessage({ action: "recording-started", user_id: uid }, "*");
      toast.success("Recording started");
    } catch (error: unknown) {
      setMeetingRecording(false);
      setMeetingRecordingOwnerUserId(null);
      cloudRecordingInstanceIdRef.current = null;
      const message =
        error instanceof Error ? error.message : "Could not start recording";
      toast.error(message);
    }
  }, [callRef, joined, meetingRecording, meetingRecordingOwnerUserId]);

  const syncMeetingOutputSpeakerFromCall = useCallback(() => {
    const call = callRef.current as DailyCallWithNativeInCallAudio | null;
    if (!call || call.isDestroyed()) return;
    if (typeof call.nativeInCallAudioMode !== "function") return;
    try {
      // Must call on `call` — extracted refs lose `this` inside daily-js.
      setMeetingOutputSpeakerOn(call.nativeInCallAudioMode() === "video");
    } catch {
      // ignore
    }
  }, [callRef]);

  const toggleMeetingOutputSpeaker = useCallback(() => {
    const call = callRef.current as DailyCallWithNativeInCallAudio | null;
    if (!call || call.isDestroyed() || !joined) return;
    if (typeof call.setNativeInCallAudioMode !== "function") {
      toast.error("Speaker mode is not available.");
      return;
    }
    const next = !meetingOutputSpeakerOn;
    try {
      call.setNativeInCallAudioMode(next ? "video" : "voice");
      setMeetingOutputSpeakerOn(next);
    } catch (error: unknown) {
      logger.error("setNativeInCallAudioMode failed", error);
      toast.error("Could not change speaker mode.");
    }
  }, [callRef, joined, logger, meetingOutputSpeakerOn]);

  useEffect(() => {
    let mounted = true;
    let listenersCall: DailyCall | null = null;

    const onParticipantUpdated = (ev: DailyEventObjectParticipant) => {
      if (!mounted) return;
      const p = ev.participant;
      if (p && !p.local) {
        if (
          p.screen === false &&
          p.session_id === remoteScreenSharerSessionIdRef.current
        ) {
          setSuppressRemoteScreenShareStage(true);
        } else if (hasRemoteScreenShareForLayout(p)) {
          setSuppressRemoteScreenShareStage(false);
        }
      }
      refreshParticipants();
    };

    const onTrackEvent = (ev: DailyEventObjectTrack) => {
      if (!mounted) return;
      const remote = ev.participant && !ev.participant.local;
      if (ev.type === "screenVideo" || ev.type === "screenAudio") {
        if (ev.type === "screenVideo" && remote) {
          if (ev.action === "track-stopped") {
            setSuppressRemoteScreenShareStage(true);
          } else if (ev.action === "track-started") {
            setSuppressRemoteScreenShareStage(false);
            if (Platform.OS === "android") {
              setMeetingLayoutEpoch((epoch) => epoch + 1);
            }
          }
        }
        refreshParticipants();
        if (
          Platform.OS === "android" &&
          ev.type === "screenVideo" &&
          (ev.action === "track-started" || ev.action === "track-stopped")
        ) {
          scheduleScreenShareMaximizeMeasure();
        }
      }
    };

    const onParticipantJoined = (ev: DailyEventObjectParticipant) => {
      if (!mounted) return;
      const p = ev.participant;
      const now = Date.now();
      if (
        p &&
        !p.local &&
        now >= suppressParticipantJoinToastsUntilRef.current
      ) {
        meetingParticipantBwToast(
          `${meetingParticipantDisplayName(p)} joined the meeting`
        );
      }
      refreshParticipants();
      const cJoin = callRef.current;
      const localJoin = cJoin?.participants()?.local;
      if (
        cJoin &&
        !cJoin.isDestroyed() &&
        meetingRecordingRef.current &&
        localJoin?.user_id &&
        meetingRecordingOwnerUserIdRef.current === localJoin.user_id
      ) {
        try {
          cJoin.sendAppMessage(
            { action: "recording-in-progress", user_id: localJoin.user_id },
            "*"
          );
        } catch (err) {
          logger.debug("recording-in-progress send failed", err);
        }
      }
    };

    const onParticipantLeft = (ev: DailyEventObjectParticipantLeft) => {
      if (!mounted) return;
      const left = ev.participant;
      if (left && !left.local) {
        meetingParticipantBwToast(
          `${meetingParticipantDisplayName(left)} left the meeting`
        );
      }
      const leftId = left?.session_id;
      if (leftId) {
        setActiveSpeakerSessionId((current) =>
          current === leftId ? "" : current
        );
      }
      refreshParticipants();
    };

    const onActiveSpeakerChange = (ev: {
      activeSpeaker: { peerId: string };
    }) => {
      if (!mounted) return;
      setActiveSpeakerSessionId(ev.activeSpeaker?.peerId ?? "");
    };

    /**
     * When the room allows transcription (`enableTranscription === 1`), keep captions on:
     * do not treat the user as "prefer off" (that path called `stopTranscription` on auto-start),
     * and explicitly start Daily transcription in case the room does not auto-start.
     */
    const applyDefaultTranscriptionAfterJoin = (
      activeCall: DailyCall | null,
      roomEnableFromJoin: number | undefined
    ) => {
      if (!mounted || !activeCall || activeCall.isDestroyed()) return;
      const roomFlag =
        roomEnableFromJoin !== undefined
          ? roomEnableFromJoin
          : enableTranscriptionRef.current;
      if (roomFlag === 1) {
        userPrefersTranscriptionOffRef.current = false;
        try {
          activeCall.startTranscription();
        } catch (error: unknown) {
          logger.debug(
            "startTranscription after join (no-op if already running)",
            error
          );
        }
      } else {
        userPrefersTranscriptionOffRef.current = true;
      }
    };

    const onTranscriptionStarted = (ev: { instanceId?: string }) => {
      if (!mounted) return;
      const instanceId = ev.instanceId ?? null;
      transcriptionInstanceIdRef.current = instanceId;

      if (
        userPrefersTranscriptionOffRef.current &&
        instanceId &&
        enableTranscriptionRef.current === 1
      ) {
        suppressNextTranscriptionStoppedToastRef.current = true;
        try {
          callRef.current?.stopTranscription({ instanceId });
        } catch {
          suppressNextTranscriptionStoppedToastRef.current = false;
          setTranscriptionActive(true);
          setEnableTranscription(1);
          enableTranscriptionRef.current = 1;
        }
        return;
      }

      setTranscriptionActive(true);
      setEnableTranscription(1);
      enableTranscriptionRef.current = 1;
    };

    const onTranscriptionStopped = (ev: { instanceId?: string }) => {
      if (!mounted) return;
      if (
        ev.instanceId &&
        transcriptionInstanceIdRef.current &&
        ev.instanceId !== transcriptionInstanceIdRef.current
      ) {
        return;
      }
      transcriptionInstanceIdRef.current = null;
      setTranscriptionActive(false);
      if (suppressNextTranscriptionStoppedToastRef.current) {
        suppressNextTranscriptionStoppedToastRef.current = false;
        return;
      }
      toast.success("Transcription stopped");
    };

    const onTranscriptionError = (ev: { errorMsg?: string }) => {
      if (!mounted) return;
      const message = ev.errorMsg?.trim() || "Transcription update failed";
      if (isIgnorableTranscriptionPermissionMessage(message)) {
        logger.debug("transcription-error (no toast):", message);
        return;
      }
      toast.error(message);
    };

    const onAppMessage = (ev: DailyEventObjectAppMessage) => {
      if (!mounted) return;
      const call = callRef.current;
      if (!call) return;
      const data = ev.data as Record<string, unknown> | undefined;
      const recAction = data?.action;
      if (
        typeof recAction === "string" &&
        (recAction === "recording-started" ||
          recAction === "recording-stopped" ||
          recAction === "recording-in-progress")
      ) {
        const userId = String(data?.user_id ?? "").trim();
        const localUid =
          call.participants()?.local?.user_id?.trim() ?? "";
        const parts = call.participants() as Record<string, DailyParticipant>;

        if (recAction === "recording-stopped") {
          setMeetingRecording(false);
          setMeetingRecordingOwnerUserId(null);
          cloudRecordingInstanceIdRef.current = null;
          if (userId && userId !== localUid) {
            toast.success("Someone stopped recording");
          }
        } else {
          if (userId) {
            setMeetingRecording(true);
            setMeetingRecordingOwnerUserId(userId);
          }
          if (recAction === "recording-started" && userId && userId !== localUid) {
            const starter = Object.values(parts).find(
              (p) => p.user_id === userId
            );
            const label = starter
              ? meetingParticipantDisplayName(starter)
              : "Someone";
            toast.success(`${label} started recording`);
          }
        }
      }
      if (ev.fromId === "transcription" && data?.is_final) {
        setTranscriptionLines((prev) => [
          ...prev,
          {
            id: makeTranscriptionId(),
            sender: String(data.user_name ?? ""),
            content: String(data.text ?? ""),
            date: String(data.timestamp ?? new Date().toISOString())
          }
        ]);
      }
      if (data?.action === "reaction" && typeof data.title === "string") {
        const fromId = String(ev.fromId ?? "");
        const localId = call.participants()?.local?.session_id ?? "";
        if (
          fromId &&
          fromId !== "transcription" &&
          !(localId && fromId === localId)
        ) {
          pushFloatingReactionRef.current(String(data.title), fromId);
        }
      }
      const chatInbound = normalizeMeetingChatInbound(
        ev.data,
        typeof ev.fromId === "string" ? ev.fromId : String(ev.fromId ?? "")
      );
      if (chatInbound) {
        const text = chatInbound.text;
        const id =
          chatInbound.clientMessageId?.trim() || makeTranscriptionId();
        const fromId = String(ev.fromId ?? "");
        const localId = call.participants()?.local?.session_id ?? "";
        const parts = call.participants() as Record<string, DailyParticipant>;
        const fromParticipant = fromId ? parts[fromId] : undefined;
        let senderName = String(
          chatInbound.user_name || fromParticipant?.user_name || "Guest"
        );
        if (fromId && localId && fromId === localId) {
          senderName = "You";
        }
        const ts = chatInbound.ts ?? Date.now();
        setMeetingChatMessages((prev) => {
          if (prev.some((m) => m.id === id)) return prev;
          const fromOthers =
            !!fromId && (!localId || fromId !== localId);
          if (
            fromOthers &&
            !meetingChatVisibleRef.current
          ) {
            queueMicrotask(() =>
              setMeetingChatUnreadCount((c) => c + 1)
            );
          }
          return [
            ...prev,
            {
              id,
              fromSessionId: fromId,
              senderName,
              text,
              ts
            }
          ];
        });
      }
    };

    const onTranscriptionMessage = (ev: {
      text?: string;
      timestamp?: Date;
      participantId?: string;
      rawResponse?: Record<string, unknown>;
    }) => {
      if (!mounted) return;
      const isFinal = ev.rawResponse?.is_final === true;
      if (!isFinal || !ev.text?.trim()) return;
      setTranscriptionLines((prev) => [
        ...prev,
        {
          id: makeTranscriptionId(),
          sender: ev.participantId ?? "Speaker",
          content: String(ev.text ?? ""),
          date:
            ev.timestamp instanceof Date
              ? ev.timestamp.toISOString()
              : new Date().toISOString()
        }
      ]);
    };

    const onJoinedMeeting = () => {
      if (!mounted) return;
      logger.debug("joined-meeting");
      suppressParticipantJoinToastsUntilRef.current =
        Date.now() + PARTICIPANT_JOIN_TOAST_ROSTER_GRACE_MS;
      setMeetingActiveGlobally(true);
      setJoined(true);
      setJoining(false);
      setLoading(false);
      lastJoinedParamsRef.current = {
        meetURL: route.params.meetURL,
        roomId: route.params.roomId,
        meetingToken: route.params.meetingToken,
        enableTranscription:
          enableTranscriptionRef.current ?? route.params.enableTranscription
      };
      applyDefaultTranscriptionAfterJoin(callRef.current, undefined);
      refreshParticipants();
      syncMeetingOutputSpeakerFromCall();
      setMeetingChatMessages([]);
      setMeetingChatUnreadCount(0);
      reactionRemovalTimersRef.current.forEach(clearTimeout);
      reactionRemovalTimersRef.current.clear();
      setFloatingReactions([]);
      setPinnedSessionIds([]);
      setScreenShareMainMaximized(false);
      setSuppressRemoteScreenShareStage(false);
      setTileMenu(null);
      setMeetingRecording(false);
      setMeetingRecordingOwnerUserId(null);
      cloudRecordingInstanceIdRef.current = null;
    };

    const onRecordingStarted = (ev: {
      instanceId?: string;
      startedBy?: string;
    }) => {
      if (!mounted) return;
      if (ev.instanceId) {
        cloudRecordingInstanceIdRef.current = ev.instanceId;
      }
      const by = ev.startedBy?.trim();
      if (by) {
        setMeetingRecording(true);
        setMeetingRecordingOwnerUserId(by);
      }
    };

    const onRecordingStopped = (ev: { instanceId?: string }) => {
      if (!mounted) return;
      const tracked = cloudRecordingInstanceIdRef.current;
      if (
        ev.instanceId &&
        tracked &&
        ev.instanceId !== tracked
      ) {
        return;
      }
      cloudRecordingInstanceIdRef.current = null;
      setMeetingRecording(false);
      setMeetingRecordingOwnerUserId(null);
    };

    const onRecordingError = (ev: { errorMsg?: string }) => {
      if (!mounted) return;
      toast.error(ev.errorMsg?.trim() || "Recording failed");
      setMeetingRecording(false);
      setMeetingRecordingOwnerUserId(null);
      cloudRecordingInstanceIdRef.current = null;
    };

    const onLeftMeeting = () => {
      if (!mounted) return;
      logger.debug("left-meeting");
      suppressParticipantJoinToastsUntilRef.current = 0;
      setJoined(false);
      setMeetingActiveGlobally(false);
      lastJoinedParamsRef.current = null;
      const c = callRef.current;
      unregisterListeners(c);
      void endMeetingGlobally();
    };

    const onDailyError = (ev: { errorMsg?: string; error?: unknown }) => {
      if (!mounted) return;
      logger.error("Daily error event", ev);
      setJoining(false);
      setLoading(false);
      const message = ev?.errorMsg ?? "Failed to join meeting";
      setErrorText(message);
      toast.error(message);
    };

    const registerListeners = (call: DailyCall) => {
      call.on("participant-joined", onParticipantJoined);
      call.on("participant-updated", onParticipantUpdated);
      call.on("track-started", onTrackEvent);
      call.on("track-stopped", onTrackEvent);
      call.on("participant-left", onParticipantLeft);
      call.on("active-speaker-change", onActiveSpeakerChange);
      call.on("joined-meeting", onJoinedMeeting);
      call.on("left-meeting", onLeftMeeting);
      call.on("error", onDailyError);
      call.on("transcription-started", onTranscriptionStarted);
      call.on("transcription-stopped", onTranscriptionStopped);
      call.on("transcription-error", onTranscriptionError);
      call.on("app-message", onAppMessage);
      call.on("transcription-message", onTranscriptionMessage);
      call.on("recording-started", onRecordingStarted);
      call.on("recording-stopped", onRecordingStopped);
      call.on("recording-error", onRecordingError);
    };

    const unregisterListeners = (call: DailyCall | null) => {
      if (!call || call.isDestroyed()) return;
      call.off("participant-joined", onParticipantJoined);
      call.off("participant-updated", onParticipantUpdated);
      call.off("track-started", onTrackEvent);
      call.off("track-stopped", onTrackEvent);
      call.off("participant-left", onParticipantLeft);
      call.off("active-speaker-change", onActiveSpeakerChange);
      call.off("joined-meeting", onJoinedMeeting);
      call.off("left-meeting", onLeftMeeting);
      call.off("error", onDailyError);
      call.off("transcription-started", onTranscriptionStarted);
      call.off("transcription-stopped", onTranscriptionStopped);
      call.off("transcription-error", onTranscriptionError);
      call.off("app-message", onAppMessage);
      call.off("transcription-message", onTranscriptionMessage);
      call.off("recording-started", onRecordingStarted);
      call.off("recording-stopped", onRecordingStopped);
      call.off("recording-error", onRecordingError);
    };

    const attachCall = async () => {
      if (!meetURL) return;

      const currentParams: MeetingNavParams = {
        meetURL: route.params.meetURL,
        roomId: route.params.roomId,
        meetingToken: route.params.meetingToken,
        enableTranscription: route.params.enableTranscription
      };

      const existing = callRef.current;
      const last = lastJoinedParamsRef.current;
      const existingState =
        existing && !existing.isDestroyed() ? existing.meetingState() : null;
      const reuse =
        existing &&
        !existing.isDestroyed() &&
        last &&
        paramsMatchMeetingNav(currentParams, last) &&
        existing.meetingState() === "joined-meeting";

      // Prevent duplicate Daily call objects while a previous join is still in progress.
      if (
        existing &&
        !existing.isDestroyed() &&
        (existingState === "joining-meeting" || existingState === "loading")
      ) {
        listenersCall = existing;
        unregisterListeners(existing);
        registerListeners(existing);
        // Re-bind listeners only — do not reset joined UI (join() fallback may
        // have already set joined; resetting hides solo + PiP on first meet).
        return;
      }

      if (reuse) {
        listenersCall = existing;
        unregisterListeners(existing);
        registerListeners(existing);
        setMeetingActiveGlobally(true);
        setJoined(true);
        setJoining(false);
        setLoading(false);
        applyDefaultTranscriptionAfterJoin(existing, undefined);
        refreshParticipants();
        syncMeetingOutputSpeakerFromCall();
        return;
      }

      if (existing && !existing.isDestroyed() && !reuse) {
        unregisterListeners(existing);
        await endMeetingGlobally();
      }

      const call = Daily.createCallObject({
        subscribeToTracksAutomatically: true
      });
      callRef.current = call;
      listenersCall = call;
      registerListeners(call);

      try {
        setJoining(true);
        logger.debug("resolve join", {
          meetURL,
          hasParamRoomId: !!paramRoomId,
          hasParamMeetingToken: !!paramMeetingToken,
          hasAccessToken: !!accessToken
        });

        /** Apply after `join()` — setting transcription earlier re-ran this effect and destroyed the call mid-join. */
        let transcriptionSettingFromRoom: number | undefined;
        /** Fresh room row from API (minted token supports cloud recording; route token may be stale). */
        let paramRoomApi: Awaited<ReturnType<typeof getMeetingRoom>> | null =
          null;

        if (paramRoomId && paramMeetingToken && accessToken) {
          try {
            paramRoomApi = await getMeetingRoom(
              normalizeMeetRoomKey(paramRoomId),
              accessToken
            );
            if (route.params.enableTranscription === undefined) {
              transcriptionSettingFromRoom =
                normalizeEnableTranscriptionFromApi(
                  paramRoomApi.enableTranscription
                );
            }
            setMeetingInviteMeta({
              dialInNum: dialInNumFromRoomMeta(paramRoomApi),
              pin: pinFromRoomMeta(paramRoomApi),
              roomId:
                paramRoomApi.roomId ?? normalizeMeetRoomKey(paramRoomId),
              token: paramRoomApi.token
            });
          } catch {
            // optional room metadata + token refresh
          }
        }

        let joinUrl: string;
        let joinToken: string | undefined;

        if (paramRoomId && paramMeetingToken) {
          const cleanRoomId = normalizeMeetRoomKey(paramRoomId);
          joinUrl = `${DAILY_ROOM_BASE_URL}/${cleanRoomId}`;
          joinToken =
            paramRoomApi?.token?.trim() || paramMeetingToken;
          logger.debug("using route roomId + meetingToken", { joinUrl });
        } else if (meetURL.includes("meet.voxo.co")) {
          const rid = parseRoomIdFromMeetVoxoUrl(meetURL);
          logger.debug("meet.voxo.co link; parsed roomId", { rid });
          if (!rid) {
            throw new Error("Could not parse room id from meeting link");
          }
          if (!accessToken) {
            throw new Error("Not signed in — cannot load meeting room");
          }
          const room = await getMeetingRoom(rid, accessToken);
          transcriptionSettingFromRoom = normalizeEnableTranscriptionFromApi(
            room.enableTranscription
          );
          setMeetingInviteMeta({
            dialInNum: dialInNumFromRoomMeta(room),
            pin: pinFromRoomMeta(room),
            roomId: room.roomId ?? normalizeMeetRoomKey(rid),
            token: room.token
          });
          joinUrl = `${DAILY_ROOM_BASE_URL}/${room.roomId ?? rid}`;
          joinToken = room.token;
          logger.debug("GET meet/room ok", {
            joinUrl,
            hasToken: !!joinToken
          });
        } else if (
          meetURL.includes("voxo.daily.co") ||
          meetURL.includes("daily.co")
        ) {
          const withoutQuery = meetURL.split("?")[0];
          let dailyParsedRoomId: string | null = null;
          try {
            const u = new URL(withoutQuery);
            const parts = u.pathname.split("/").filter(Boolean);
            if (parts.length > 0) {
              const last = decodeURIComponent(parts[parts.length - 1] ?? "");
              const clean = normalizeMeetRoomKey(last);
              dailyParsedRoomId = clean;
              parts[parts.length - 1] = clean;
              joinUrl = `${u.origin}/${parts.join("/")}`;
            } else {
              joinUrl = withoutQuery;
            }
          } catch {
            joinUrl = withoutQuery;
          }
          joinToken = paramMeetingToken;
          if (
            dailyParsedRoomId &&
            accessToken &&
            transcriptionSettingFromRoom === undefined
          ) {
            try {
              const roomMeta = await getMeetingRoom(
                dailyParsedRoomId,
                accessToken
              );
              transcriptionSettingFromRoom =
                normalizeEnableTranscriptionFromApi(
                  roomMeta.enableTranscription
                );
            } catch {
              // optional — join still proceeds with Daily URL only
            }
          }
          logger.debug("using daily URL from params", {
            joinUrl,
            hasToken: !!joinToken
          });
        } else {
          joinUrl = meetURL;
          joinToken = paramMeetingToken;
          logger.warn(
            "fallback: joining with URL as-is (share links often need token)",
            {
              joinUrl
            }
          );
        }

        logger.debug("Daily join()", {
          joinUrl,
          hasToken: !!joinToken,
          userName: joinDisplayName
        });
        suppressParticipantJoinToastsUntilRef.current =
          Date.now() + PARTICIPANT_JOIN_TOAST_CONNECT_HOLD_MS;
        await call.join({
          url: joinUrl,
          ...(joinToken ? { token: joinToken } : {}),
          userName: joinDisplayName,
          userData: joinUserData,
          receiveSettings: {
            base: { video: { layer: 0 } }
          }
        });
        if (!mounted) return;
        suppressParticipantJoinToastsUntilRef.current =
          Date.now() + PARTICIPANT_JOIN_TOAST_ROSTER_GRACE_MS;
        if (transcriptionSettingFromRoom !== undefined) {
          setEnableTranscription(transcriptionSettingFromRoom);
          enableTranscriptionRef.current = transcriptionSettingFromRoom;
        }
        // Fallback for occasional missed/late joined-meeting event:
        // keep controls interactive as soon as join() succeeds.
        setMeetingActiveGlobally(true);
        setJoined(true);
        setJoining(false);
        setLoading(false);
        lastJoinedParamsRef.current = {
          meetURL: route.params.meetURL,
          roomId: route.params.roomId,
          meetingToken: route.params.meetingToken,
          enableTranscription:
            transcriptionSettingFromRoom ?? route.params.enableTranscription
        };
        applyDefaultTranscriptionAfterJoin(call, transcriptionSettingFromRoom);
        refreshParticipants();
        syncMeetingOutputSpeakerFromCall();
      } catch (error: unknown) {
        if (!mounted) return;
        logger.error("join failed", error);
        suppressParticipantJoinToastsUntilRef.current = 0;
        unregisterListeners(call);
        await endMeetingGlobally();
        setJoining(false);
        setLoading(false);
        const message =
          error instanceof Error ? error.message : "Failed to join meeting";
        setErrorText(message);
        toast.error(message);
      }
    };

    void attachCall();

    return () => {
      mounted = false;
      suppressParticipantJoinToastsUntilRef.current = 0;
      unregisterListeners(listenersCall);
      if (intentLeaveRef.current) {
        void endMeetingGlobally();
      } else {
        const c = callRef.current;
        if (
          c &&
          !c.isDestroyed() &&
          c.meetingState() !== "joined-meeting"
        ) {
          void endMeetingGlobally();
        }
      }
      intentLeaveRef.current = false;
    };
  }, [
    accessToken,
    endMeetingGlobally,
    joinDisplayName,
    joinUserData,
    logger,
    meetURL,
    paramMeetingToken,
    paramRoomId,
    refreshParticipants,
    route.params.enableTranscription,
    scheduleScreenShareMaximizeMeasure,
    syncMeetingOutputSpeakerFromCall
  ]);

  if (!meetURL) {
    return (
      <SafeAreaView
        style={[
          styles.centered,
          {
            backgroundColor: theme.colors["color-colors-background-bg-primary"]
          }
        ]}
      >
        <Text size={fontSize.md} weight="medium">
          Meeting link is missing.
        </Text>
      </SafeAreaView>
    );
  }

  const bgPrimary = theme.colors["color-colors-background-bg-primary"];
  const borderSecondary =
    theme.colors["color-colors-border-border-secondary"];
  const textSecondary = theme.colors["color-colors-text-text-secondary"];
  const micMutedColor =
    theme.colors["color-colors-foreground-fg-error-primary"];
  const noVideoBg = "#333537";

  const openInviteOthers = useCallback(() => {
    if (!inviteLinkToCopy) return;
    const openWithMeta = (meta: typeof meetingInviteMeta) => {
      openDrawer(
        <MeetingInviteOthersDrawer
          meetURL={inviteLinkToCopy}
          dialInNum={meta?.dialInNum}
          pin={meta?.pin}
          roomId={meta?.roomId}
          token={meta?.token}
          creatorName={joinDisplayName}
          appearance="meeting"
          onClose={closeDrawer}
        />,
        0.9,
        {
          backgroundColor: "#1f1f21",
          borderColor: "#1f1f21",
          handleColor: "#3a3f44"
        }
      );
    };

    // If we already have the metadata needed for web invites, open immediately.
    if (meetingInviteMeta?.roomId && meetingInviteMeta?.dialInNum && meetingInviteMeta?.pin) {
      openWithMeta(meetingInviteMeta);
      return;
    }

    (async () => {
      if (!accessToken) {
        openWithMeta(meetingInviteMeta);
        return;
      }

      const ridFromParams = paramRoomId?.trim();
      const ridFromMeetVoxo = meetURL ? parseRoomIdFromMeetVoxoUrl(meetURL) : null;
      let ridFromDaily: string | null = null;
      if (meetURL && (meetURL.includes("voxo.daily.co") || meetURL.includes("daily.co"))) {
        try {
          const u = new URL(meetURL.split("?")[0]);
          const parts = u.pathname.split("/").filter(Boolean);
          const last = parts[parts.length - 1] ?? "";
          ridFromDaily = last ? normalizeMeetRoomKey(decodeURIComponent(last)) : null;
        } catch {
          ridFromDaily = null;
        }
      }

      const rid = ridFromParams || ridFromMeetVoxo || ridFromDaily;
      if (!rid) {
        openWithMeta(meetingInviteMeta);
        return;
      }

      try {
        const meta = await getMeetingRoom(normalizeMeetRoomKey(rid), accessToken);
        console.log("meta---", JSON.stringify(meta, null, 2));
        const next = {
          dialInNum: dialInNumFromRoomMeta(meta),
          pin: pinFromRoomMeta(meta),
          roomId: meta.roomId ?? rid,
          token: meta.token
        };
        console.log("next", JSON.stringify(next, null, 2));
        setMeetingInviteMeta(next);
        openWithMeta(next);
      } catch {
        openWithMeta(meetingInviteMeta);
      }
    })();
  }, [
    accessToken,
    closeDrawer,
    inviteLinkToCopy,
    joinDisplayName,
    meetURL,
    meetingInviteMeta,
    openDrawer,
    paramRoomId
  ]);

  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: '#131314' ,paddingTop: insets.top }]}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#131314"
        translucent={false}
      />
      <View
        style={[
          styles.header,
          { borderBottomColor: borderSecondary }
        ]}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => {
            if (joined) {
              minimizeMeeting();
            } else {
              navigation.goBack();
            }
          }}
        >
          <Icon name="arrow-left" size={20} color="white" />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[
              styles.headerSpeakerButton,
              joined && meetingOutputSpeakerOn && styles.headerSpeakerButtonOn
            ]}
            onPress={toggleMeetingOutputSpeaker}
            disabled={!joined}
            accessibilityRole="button"
            accessibilityLabel={
              meetingOutputSpeakerOn
                ? "Speaker on, switch to earpiece"
                : "Earpiece mode, switch to speaker"
            }
            accessibilityState={{ disabled: !joined }}
          >
            <Icon
              name="volume-max"
              size={22}
              color={joined ? "white" : "rgba(255,255,255,0.35)"}
            />
          </TouchableOpacity>
          <View style={styles.headerChatButtonWrap}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setMeetingChatVisible(true)}
              disabled={!joined}
              accessibilityRole="button"
              accessibilityLabel="Open meeting chat"
              accessibilityState={{ disabled: !joined }}
            >
              <Icon
                name="message-text-square-01"
                size={22}
                color={joined ? "white" : "rgba(255,255,255,0.35)"}
              />
            </TouchableOpacity>
            {meetingChatUnreadCount > 0 ? (
              <View style={styles.headerChatBadge} pointerEvents="none">
                <Text
                  size={fontSize.xs}
                  weight="semiBold"
                  style={styles.headerChatBadgeLabel}
                >
                  {meetingChatUnreadCount >= 9 ? "9+" : String(meetingChatUnreadCount)}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setParticipantsDrawerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open participants list"
          >
            <Icon name="users-01" size={22} color="white" />
          </TouchableOpacity>
        </View>
      </View>


      {loading ? (
        <View style={styles.loader}>
          <ActivityIndicator size="large" />
          {/* <Text size={fontSize.sm} style={styles.loaderText}>
            {joining ? "Joining meeting..." : "Preparing meeting..."}
          </Text> */}
        </View>
      ) : null}

      <View
        ref={stageRef}
        collapsable={false}
        style={styles.stage}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width !== stageSize.width || height !== stageSize.height) {
            setStageSize({ width, height });
          }
          updateScreenShareMaximizeRect();
        }}
      >
        {errorText ? (
          <View style={styles.errorBox}>
            <Text size={fontSize.md} weight="semiBold">
              Unable to open meeting
            </Text>
            <Text size={fontSize.sm} style={styles.errorText}>
              {errorText}
            </Text>
          </View>
        ) : soloInMeeting ? (
          <>
            <MeetingSoloInvitePanel
              inviteLinkDisplay={inviteLinkDisplay}
              inviteLinkToCopy={inviteLinkToCopy}
              onCopy={copyInviteLink}
              onShare={() => {
                void shareInviteLink();
              }}
            />
            {localParticipant?.session_id ? (
              <MeetingReactionFloaters
                variant="stage"
                items={floatingReactions.filter(
                  (r) => r.fromSessionId === localParticipant.session_id
                )}
              />
            ) : null}
          </>
        ) : showRemoteScreenShareLayout ? (
          isLandscapeLayout ? (
            <View style={styles.screenShareStageRowLandscape}>
              <RemoteScreenShareMainPane
                paneRef={screenShareMainPaneRef}
                onPaneLayout={updateScreenShareMaximizeRect}
                participant={remoteScreenSharer}
                containerStyle={styles.screenShareMainLandscape}
                floatingReactions={floatingReactions}
                onTileLongPress={onTileLongPress}
                onMaximize={openScreenShareFullscreen}
                videoSuspended={screenShareMainVideoSuspended}
                videoReady={screenShareInlineVideoReady}
                layoutEpoch={meetingLayoutEpoch}
              />
              <ScreenShareLandscapeRightGrid
                slots={screenShareLandscapeGridParticipants}
                overflowMore={screenShareLandscapeGridOverflow}
                remoteScreenSharer={remoteScreenSharer}
                activeSpeakerSessionId={activeSpeakerSessionId}
                participantsLength={participants.length}
                floatingReactions={floatingReactions}
                noVideoBg={noVideoBg}
                micMutedColor={micMutedColor}
                onTileLongPress={onTileLongPress}
                layoutEpoch={meetingLayoutEpoch}
              />
            </View>
          ) : (
            <View style={styles.screenShareStageColumn}>
              <RemoteScreenShareMainPane
                paneRef={screenShareMainPaneRef}
                onPaneLayout={updateScreenShareMaximizeRect}
                participant={remoteScreenSharer}
                containerStyle={[
                  styles.screenShareMain,
                  screenShareRailVisible.length === 0 &&
                    screenShareRailOverflow === 0
                    ? { marginBottom: 0 }
                    : null
                ]}
                floatingReactions={floatingReactions}
                onTileLongPress={onTileLongPress}
                onMaximize={openScreenShareFullscreen}
                videoSuspended={screenShareMainVideoSuspended}
                videoReady={screenShareInlineVideoReady}
                layoutEpoch={meetingLayoutEpoch}
              />
              {screenShareRailVisible.length > 0 ||
              screenShareRailOverflow > 0 ? (
                <ScrollView
                  key={`ss-rail-${remoteScreenSharer?.session_id ?? "none"}-${meetingLayoutEpoch}-${suppressRemoteScreenShareStage ? "1" : "0"}`}
                  horizontal
                  style={styles.screenShareRail}
                  contentContainerStyle={styles.screenShareRailContent}
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {screenShareRailVisible.map((item) => (
                    <ScreenShareStageRailCard
                      key={`${item.session_id}-${meetingLayoutEpoch}`}
                      item={item}
                      remoteScreenSharer={remoteScreenSharer}
                      activeSpeakerSessionId={activeSpeakerSessionId}
                      participantsLength={participants.length}
                      floatingReactions={floatingReactions}
                      noVideoBg={noVideoBg}
                      micMutedColor={micMutedColor}
                      onTileLongPress={onTileLongPress}
                      tileWrapperStyle={styles.screenShareRailTile}
                      tileWidth={SCREEN_SHARE_RAIL_TILE_WIDTH}
                      tileHeight={SCREEN_SHARE_RAIL_TILE_HEIGHT}
                      layoutEpoch={meetingLayoutEpoch}
                    />
                  ))}
                  {screenShareRailOverflow > 0 ? (
                    <View style={styles.screenShareRailOverflowTile}>
                      <Text size={fontSize.md} weight="semiBold" color="white">
                        +{screenShareRailOverflow}
                      </Text>
                      <Text
                        size={fontSize.xs}
                        weight="medium"
                        style={styles.screenShareRailOverflowSubLabel}
                      >
                        more
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              ) : null}
            </View>
          )
        ) : (
          <MeetingRemoteStage
            gridParticipants={sortedGridParticipants}
            activeSpeakerSessionId={activeSpeakerSessionId}
            participantsLength={participants.length}
            floatingReactions={floatingReactions}
            noVideoBg={noVideoBg}
            micMutedColor={micMutedColor}
            galleryColumns={gridColumns}
            galleryRows={gridRows}
            gridTileWidth={gridTileWidth}
            gridTileHeight={gridTileHeight}
            gridGap={REMOTE_GRID_GAP}
            gridPadding={REMOTE_GRID_PADDING}
            pinnedSessionIds={pinnedSessionIds.slice(0, PIN_MAX)}
            filmstripBottom={!isLandscapeLayout}
            onTileLongPress={onTileLongPress}
          />
        )}

        {showLocalPiP && localParticipant ? (
          <LocalMeetingPiPOverlay
            visible
            stageWidth={stageSize.width}
            stageHeight={stageSize.height}
            windowWidth={windowWidth}
            windowHeight={windowHeight}
            localParticipant={localParticipant}
            displayName={joinDisplayName}
            noVideoBg={noVideoBg}
            micMutedColor={micMutedColor}
            localHandRaise={localHandRaise}
            localScreenSharing={localScreenSharing}
            floatingReactions={floatingReactions}
            remotesPresent={pipRemotesPresent}
            clipRefreshKey={pipClipRefreshKey}
          />
        ) : null}

        {Platform.OS === "android" &&
        showRemoteScreenShareLayout &&
        !screenShareMainMaximized ? (
          <TouchableOpacity
            style={[
              styles.screenShareStageMaximize,
              screenShareMaximizeRect ?? styles.screenShareStageMaximizeFallback
            ]}
            onPress={openScreenShareFullscreen}
            activeOpacity={0.75}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fullscreen shared screen"
          >
            <Icon name="maximize-01" size={20} color="white" />
          </TouchableOpacity>
        ) : null}
      </View>

      <MeetingTileContextMenu
        visible={tileMenu != null}
        anchorX={tileMenu?.pageX ?? 0}
        anchorY={tileMenu?.pageY ?? 0}
        isPinned={tileMenuMeta.isPinned}
        canPin={tileMenuMeta.canPin}
        pinBlocked={tileMenuMeta.pinBlocked}
        onDismiss={() => setTileMenu(null)}
        onPin={handleMenuPin}
        onUnpin={handleMenuUnpin}
      />

      <MeetingBottomControls
        joined={joined}
        audioOn={audioOn}
        videoOn={videoOn}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        localScreenSharing={localScreenSharing}
        onToggleScreenShare={toggleScreenShare}
        localHandRaise={localHandRaise}
        onToggleRaiseHand={() => {
          void toggleRaiseHand();
        }}
        onSelectReaction={sendReaction}
        showTranscriptionButton={showTranscriptionButton}
        onOpenTranscriptionSheet={() => setTranscriptSheetVisible(true)}
        onAddOthers={openInviteOthers}
        onLeave={promptLeaveMeeting}
        onOpenMeetingChat={() => setMeetingChatVisible(true)}
        borderSecondary={borderSecondary}
        reactionPanelBg={bgPrimary}
      />

      <MeetingParticipantsDrawer
        visible={participantsDrawerVisible}
        onClose={() => setParticipantsDrawerVisible(false)}
        participants={participants}
        bgPrimary={bgPrimary}
        borderSecondary={borderSecondary}
        textSecondary={textSecondary}
      />

      <MeetingChatSheet
        visible={meetingChatVisible}
        onClose={() => setMeetingChatVisible(false)}
        messages={meetingChatMessagesSorted}
        onSend={sendMeetingChat}
        composerHint={joinDisplayName}
        canSend={joined}
        localSessionId={localParticipant?.session_id ?? ""}
      />

      <MeetingTranscriptionSheet
        visible={transcriptSheetVisible}
        onClose={() => setTranscriptSheetVisible(false)}
        lines={transcriptionLines}
        transcriptionActive={transcriptionActive}
      />

      {Platform.OS === "android" &&
      showRemoteScreenShareLayout &&
      screenShareMainMaximized &&
      remoteScreenSharer != null ? (
        <View style={styles.androidScreenShareFullscreen} pointerEvents="box-none">
          <ScreenShareExpandedOverlay
            presentation="sharedScreen"
            participant={remoteScreenSharer}
            onClose={closeScreenShareFullscreen}
            noVideoBg={noVideoBg}
            micMutedColor={micMutedColor}
            floatingReactions={floatingReactions}
            videoReady={screenShareFullscreenVideoReady}
            layoutEpoch={meetingLayoutEpoch}
            stageWidth={windowWidth}
            stageHeight={windowHeight}
            useFullscreenRevealCurtain
          />
        </View>
      ) : null}

      {Platform.OS === "ios" ? (
        <Modal
          visible={
            showRemoteScreenShareLayout &&
            screenShareMainMaximized &&
            remoteScreenSharer != null
          }
          animationType="fade"
          presentationStyle="fullScreen"
          supportedOrientations={[...SCREEN_SHARE_FULLSCREEN_MODAL_ORIENTATIONS]}
          statusBarTranslucent
          onRequestClose={closeScreenShareFullscreen}
        >
          <View
            style={[
              styles.meetingScreenShareFullscreenShell,
              { width: windowWidth, height: windowHeight }
            ]}
          >
            {remoteScreenSharer ? (
              <ScreenShareExpandedOverlay
                presentation="sharedScreen"
                participant={remoteScreenSharer}
                onClose={closeScreenShareFullscreen}
                noVideoBg={noVideoBg}
                micMutedColor={micMutedColor}
                floatingReactions={floatingReactions}
                stageWidth={windowWidth}
                stageHeight={windowHeight}
              />
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  /** Android: in-stage fullscreen — same window as rail tiles (no Modal layer jump). */
  androidScreenShareFullscreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 500,
    elevation: 500,
    backgroundColor: "#000"
  },
  /** Fills the fullScreen Modal (under status bar when translucent). */
  meetingScreenShareFullscreenShell: {
    flex: 1,
    width: "100%",
    height: "100%",
    backgroundColor: "#000"
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  stage: {
    flex: 1,
    ...Platform.select({
      android: { minHeight: 0 },
      default: {}
    })
  },
  header: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: padding.md
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10
  },
  headerTitle: {
    textAlign: "center",
    flex: 1
  },
  backButton: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center"
  },
  /** Matches MeetingBottomControls `moreActionActive` (#3f9df8). */
  headerSpeakerButton: {
    height: 36,
    width: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10
  },
  headerSpeakerButtonOn: {
    backgroundColor: "#3f9df8"
  },
  headerChatButtonWrap: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center"
  },
  /** Match web MeetingControls unread pill (error utility tones). */
  headerChatBadge: {
    position: "absolute",
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ef4444",
    borderWidth: 1,
    borderColor: "#dc2626"
  },
  headerChatBadgeLabel: {
    color: "#fff",
    fontSize: 10,
    lineHeight: 12
  },
  loader: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2
  },
  loaderText: {
    marginTop: padding.md
  },
  screenShareStageColumn: {
    flex: 1,
    flexDirection: "column",
    width: "100%",
    minHeight: 0,
    paddingHorizontal: REMOTE_GRID_PADDING,
    paddingTop: REMOTE_GRID_PADDING,
    paddingBottom: REMOTE_GRID_PADDING
  },
  /** Landscape: shared screen left (~50%), cameras stacked right (~50%). */
  screenShareStageRowLandscape: {
    flex: 1,
    flexDirection: "row",
    width: "100%",
    minHeight: 0,
    paddingHorizontal: REMOTE_GRID_PADDING,
    paddingTop: REMOTE_GRID_PADDING,
    paddingBottom: REMOTE_GRID_PADDING,
    gap: REMOTE_GRID_GAP
  },
  screenShareMainTouchHost: {
    position: "relative",
    overflow: "visible"
  },
  screenShareVideoClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000"
  },
  screenShareControlsLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 32,
    ...Platform.select({
      android: { elevation: 32 },
      default: {}
    })
  },
  screenShareMainLandscape: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    borderRadius: 12,
    backgroundColor: "#000",
    position: "relative"
  },
  screenShareRailLandscapeColumn: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: "#0b0f1a",
    borderRadius: 12,
    overflow: "hidden"
  },
  screenShareRailLandscapeOverflowTile: {
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  screenShareMain: {
    width: "100%",
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    backgroundColor: "#000",
    marginBottom: REMOTE_GRID_GAP,
    position: "relative"
  },
  screenShareMediaStack: {
    ...StyleSheet.absoluteFillObject
  },
  screenShareMainLongPress: {
    position: "absolute",
    top: SCREEN_SHARE_MAIN_MAXIMIZE_CLEAR_TOP,
    right: SCREEN_SHARE_MAIN_MAXIMIZE_CLEAR_RIGHT,
    left: 0,
    bottom: 0,
    zIndex: 8
  },
  screenShareMainMaximize: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 34,
    padding: 8,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    ...Platform.select({
      android: { elevation: 34 },
      default: {}
    })
  },
  /** Android: drawn last on the stage so RTCView cannot steal the first tap. */
  screenShareStageMaximize: {
    position: "absolute",
    zIndex: 200,
    elevation: 200,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  screenShareStageMaximizeFallback: {
    top: REMOTE_GRID_PADDING + 8,
    right: REMOTE_GRID_PADDING + 8,
    width: SCREEN_SHARE_MAXIMIZE_BTN_SIZE,
    height: SCREEN_SHARE_MAXIMIZE_BTN_SIZE
  },
  screenShareVideo: {
    ...StyleSheet.absoluteFillObject
  },
  screenShareVideoPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000"
  },
  screenShareMainBadge: {
    position: "absolute",
    bottom: 10,
    left: 10,
    zIndex: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    maxWidth: "85%"
  },
  screenShareRail: {
    height: 110,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    overflow: "hidden"
  },
  screenShareRailContent: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    gap: REMOTE_GRID_GAP,
    alignItems: "center"
  },
  screenShareRailTile: {
    width: SCREEN_SHARE_RAIL_TILE_WIDTH,
    aspectRatio: 0.65, // ✅ better proportions
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    position: "relative"
  },
  screenShareRailLongPress: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 14
  },
  /** Sharer tile: dim + icon so the rail shows who is presenting. */
  screenShareSharerRailOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.58)",
    zIndex: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6
  },
  screenShareSharerRailLabel: {
    marginTop: 6,
    textAlign: "center"
  },
  screenShareRailBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    zIndex: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  screenShareRailOverflowTile: {
    width: SCREEN_SHARE_RAIL_TILE_WIDTH,
    aspectRatio: 0.75,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    gap: 2
  },
  screenShareRailOverflowSubLabel: {
    color: "rgba(255,255,255,0.75)"
  },
  remoteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: REMOTE_GRID_PADDING
  },
  tile: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0f172a"
  },
  singleTileCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8
  },
  video: {
    flex: 1
  },
  badge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    zIndex: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  noVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: "center",
    justifyContent: "center"
  },
  initialsCircle: {
    width: "44%",
    maxWidth: 96,
    aspectRatio: 1,
    maxHeight: 96,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15, 23, 42, 0.55)",

  },
  micPill: {
    position: "absolute",
    top: 8,
    right: 8,
    zIndex: 4,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  handRaisedPill: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 4,
    padding: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)"
  },
  errorBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: padding.lg
  },
  errorText: {
    textAlign: "center",
    marginTop: padding.sm
  }
});
