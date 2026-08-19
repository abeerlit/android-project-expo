import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type GestureResponderEvent
} from "react-native";
import { type DailyParticipant } from "@daily-co/react-native-daily-js";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  ZoomIn
} from "react-native-reanimated";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { fontSize } from "core/theme/theme.ts";
import {
  MeetingReactionFloaters,
  type FloatingMeetingReaction
} from "features/meeting/components/MeetingReactionFloaters.tsx";
import { MeetingTileMediaView } from "features/meeting/components/MeetingTileMediaView.tsx";
import {
  getAudioTrackForTile,
  getTileVideoTrackId,
  getVideoTrackForTile,
  initialsFromUserName,
  participantHandRaised
} from "features/meeting/meetingParticipantTracks.ts";

const FILMSTRIP_HEIGHT = 118;
const FILMSTRIP_WIDTH = 112;
const FILMSTRIP_TILE_WIDTH = 104;
const FILMSTRIP_TILE_HEIGHT = 100;
/** Gap between spotlight split cells. */
const SPOTLIGHT_GAP = 8;

export type MeetingRemoteStageProps = {
  gridParticipants: DailyParticipant[];
  activeSpeakerSessionId: string;
  participantsLength: number;
  floatingReactions: FloatingMeetingReaction[];
  noVideoBg: string;
  micMutedColor: string;
  galleryColumns: number;
  galleryRows: number;
  gridTileWidth: number;
  gridTileHeight: number;
  gridGap: number;
  gridPadding: number;
  pinnedSessionIds: string[];
  /** `true` = filmstrip along bottom (portrait); `false` = filmstrip on trailing edge (landscape). */
  filmstripBottom: boolean;
  onTileLongPress: (sessionId: string, pageX: number, pageY: number) => void;
};

type RemoteTileProps = {
  item: DailyParticipant;
  style: object;
  tileWidth: number;
  tileHeight: number;
  noVideoBg: string;
  micMutedColor: string;
  reactions: FloatingMeetingReaction[];
  showPinBadge: boolean;
  onLongPressAt: (pageX: number, pageY: number) => void;
  reactionCompact?: boolean;
  showSingleTileCard?: boolean;
  showActiveSpeakerRing?: boolean;
  /** Spotlight / pin stage: scale-in so tiles feel like they grow into place. */
  useSpotlightEnter?: boolean;
};

/** Per-participant key — only the changed tile remounts on camera toggle. */
const tileKey = (item: DailyParticipant): string =>
  `${item.session_id}-${getTileVideoTrackId(item)}`;

const MeasuredTileHost = ({
  style,
  children
}: {
  style: object;
  children: (width: number, height: number) => React.ReactNode;
}) => {
  const [size, setSize] = useState({ w: 0, h: 0 });

  return (
    <View
      style={style}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setSize((prev) =>
          prev.w === width && prev.h === height ? prev : { w: width, h: height }
        );
      }}
    >
      {size.w >= 1 && size.h >= 1 ? children(size.w, size.h) : null}
    </View>
  );
};

const RemoteParticipantTile = ({
  item,
  style,
  tileWidth,
  tileHeight,
  noVideoBg,
  micMutedColor,
  reactions,
  showPinBadge,
  onLongPressAt,
  reactionCompact = false,
  showSingleTileCard = false,
  showActiveSpeakerRing = false,
  useSpotlightEnter = false
}: RemoteTileProps) => {
  const videoTrack = getVideoTrackForTile(item);
  const hasVideo = videoTrack != null;
  const displayForInitials = item.user_name || "Guest";
  const initials = initialsFromUserName(displayForInitials);
  const showMutedMic = item.audio !== true;
  const showHandRaised = participantHandRaised(item);

  const onLongPress = (e: GestureResponderEvent) => {
    onLongPressAt(e.nativeEvent.pageX, e.nativeEvent.pageY);
  };

  const entering = useSpotlightEnter
    ? ZoomIn.duration(260).springify().damping(17).stiffness(200)
    : FadeIn.duration(170);

  const animatedProps =
    Platform.OS === "android"
      ? useSpotlightEnter
        ? {
            entering,
            exiting: FadeOut.duration(140)
          }
        : {}
      : {
          entering,
          exiting: FadeOut.duration(140),
          layout: LinearTransition.springify().damping(19).stiffness(180)
        };

  return (
    <Animated.View
      {...animatedProps}
      style={[
        styles.tile,
        style,
        showSingleTileCard && styles.singleTileCard,
        showActiveSpeakerRing && {
          borderWidth: 2,
          borderColor: "#8ab4f8"
        }
      ]}
    >
      <View style={styles.tileMediaStack} pointerEvents="box-none">
        <MeetingTileMediaView
          videoTrack={videoTrack}
          audioTrack={getAudioTrackForTile(item)}
          mirror={item.local}
          local={item.local}
          objectFit="cover"
          width={tileWidth}
          height={tileHeight}
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
            <Icon name="microphone-off-02" size={14} color={micMutedColor} />
          </View>
        ) : null}
        <View style={styles.badge} pointerEvents="none">
          <Text size={fontSize.xs} weight="medium" color="white">
            {item.user_name || "Guest"}
          </Text>
        </View>
      </View>
      {showPinBadge ? (
        <View style={styles.pinBadge} pointerEvents="none">
          <Icon name="target-05" size={14} color="#fbbf24" />
        </View>
      ) : null}
      <MeetingReactionFloaters compact={reactionCompact} variant="tile" items={reactions} />
      {/* Video layer can swallow touches; this layer receives long-press for pin menu. */}
      <Pressable style={styles.tileLongPressCapture} delayLongPress={480} onLongPress={onLongPress} />
    </Animated.View>
  );
};

const computeTwoPinSquareSide = (innerW: number, innerH: number): number => {
  if (innerW < 16 || innerH < 16) return 0;
  const maxEachW = (innerW - SPOTLIGHT_GAP) / 2;
  // Equal square tiles side-by-side, centered in the spotlight (Meet-style).
  return Math.min(maxEachW, innerH - 8);
};

const SpotlightCells = ({
  pinned,
  noVideoBg,
  micMutedColor,
  activeSpeakerSessionId,
  participantsLength,
  floatingReactions,
  onTileLongPress,
  spotlightInnerWidth,
  spotlightInnerHeight
}: {
  pinned: DailyParticipant[];
  noVideoBg: string;
  micMutedColor: string;
  activeSpeakerSessionId: string;
  participantsLength: number;
  floatingReactions: FloatingMeetingReaction[];
  onTileLongPress: (sessionId: string, pageX: number, pageY: number) => void;
  spotlightInnerWidth: number;
  spotlightInnerHeight: number;
}) => {
  const cells = pinned.slice(0, 4);
  const n = cells.length;
  const ring = (p: DailyParticipant) =>
    p.session_id === activeSpeakerSessionId &&
    p.audio === true &&
    participantsLength > 1;

  const tileReactions = (sid: string) =>
    floatingReactions.filter((r) => r.fromSessionId === sid);

  const renderTile = (
    p: DailyParticipant,
    tileStyle: object,
    tileWidth: number,
    tileHeight: number,
    extra?: Partial<RemoteTileProps>
  ) => (
    <RemoteParticipantTile
      key={tileKey(p)}
      item={p}
      style={tileStyle}
      tileWidth={tileWidth}
      tileHeight={tileHeight}
      noVideoBg={noVideoBg}
      micMutedColor={micMutedColor}
      reactions={tileReactions(p.session_id)}
      showPinBadge
      showActiveSpeakerRing={ring(p)}
      onLongPressAt={(x, y) => onTileLongPress(p.session_id, x, y)}
      useSpotlightEnter
      {...extra}
    />
  );

  if (n === 1) {
    const p = cells[0];
    return (
      <MeasuredTileHost style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
        {(w, h) =>
          renderTile(p, { width: w, height: h }, w, h)
        }
      </MeasuredTileHost>
    );
  }

  if (n === 2) {
    const side = computeTwoPinSquareSide(spotlightInnerWidth, spotlightInnerHeight);
    const twoPinTileStyle =
      side > 0
        ? { width: side, height: side }
        : { flex: 1, minWidth: 0, minHeight: 0, alignSelf: "stretch" };
    return (
      <View style={styles.spotlightTwoPinCenter}>
        <View style={styles.spotlightTwoPinRow}>
          {cells.map((p) =>
            side > 0 ? (
              renderTile(p, twoPinTileStyle, side, side)
            ) : (
              <MeasuredTileHost key={tileKey(p)} style={twoPinTileStyle}>
                {(w, h) => renderTile(p, { width: w, height: h }, w, h)}
              </MeasuredTileHost>
            )
          )}
        </View>
      </View>
    );
  }

  if (n === 3) {
    const [a, b, c] = cells;
    return (
      <View style={styles.spotlightCol}>
        <View style={styles.spotlightRow}>
          <MeasuredTileHost style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            {(w, h) => renderTile(a, { width: w, height: h }, w, h)}
          </MeasuredTileHost>
          <MeasuredTileHost style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
            {(w, h) => renderTile(b, { width: w, height: h }, w, h)}
          </MeasuredTileHost>
        </View>
        <View style={styles.spotlightThirdRow}>
          <MeasuredTileHost style={styles.spotlightThirdInner}>
            {(w, h) => renderTile(c, { width: w, height: h }, w, h)}
          </MeasuredTileHost>
        </View>
      </View>
    );
  }

  const [p0, p1, p2, p3] = cells;
  return (
    <View style={styles.spotlightCol}>
      <View style={styles.spotlightRow}>
        <MeasuredTileHost style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {(w, h) => renderTile(p0, { width: w, height: h }, w, h)}
        </MeasuredTileHost>
        <MeasuredTileHost style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {(w, h) => renderTile(p1, { width: w, height: h }, w, h)}
        </MeasuredTileHost>
      </View>
      <View style={styles.spotlightRow}>
        <MeasuredTileHost style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {(w, h) => renderTile(p2, { width: w, height: h }, w, h)}
        </MeasuredTileHost>
        <MeasuredTileHost style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          {(w, h) => renderTile(p3, { width: w, height: h }, w, h)}
        </MeasuredTileHost>
      </View>
    </View>
  );
};

export const MeetingRemoteStage = ({
  gridParticipants,
  activeSpeakerSessionId,
  participantsLength,
  floatingReactions,
  noVideoBg,
  micMutedColor,
  galleryColumns,
  galleryRows,
  gridTileWidth,
  gridTileHeight,
  gridGap,
  gridPadding,
  pinnedSessionIds,
  filmstripBottom,
  onTileLongPress
}: MeetingRemoteStageProps) => {
  const [spotlightInner, setSpotlightInner] = useState({ w: 0, h: 0 });

  const pinnedSet = useMemo(() => new Set(pinnedSessionIds), [pinnedSessionIds]);

  const pinnedParticipants = useMemo(() => {
    const list: DailyParticipant[] = [];
    for (const id of pinnedSessionIds) {
      const p = gridParticipants.find((x) => x.session_id === id);
      if (p) list.push(p);
    }
    return list;
  }, [gridParticipants, pinnedSessionIds]);

  const unpinnedParticipants = useMemo(
    () => gridParticipants.filter((p) => !pinnedSet.has(p.session_id)),
    [gridParticipants, pinnedSet]
  );

  const spotlightActive = pinnedSessionIds.length > 0 && pinnedParticipants.length > 0;
  const gallery = !spotlightActive;

  if (gallery) {
    return (
      <View style={[styles.remoteGrid, { padding: gridPadding }]}>
        {gridParticipants.map((item, index) => {
          const isLastCol = (index + 1) % galleryColumns === 0;
          const isLastRow = index >= (galleryRows - 1) * galleryColumns;
          const showSingleTileCard = gridParticipants.length === 1;
          const showActiveSpeakerRing =
            item.session_id === activeSpeakerSessionId &&
            item.audio === true &&
            participantsLength > 1;

          return (
            <RemoteParticipantTile
              key={tileKey(item)}
              item={item}
              style={{
                width: gridTileWidth,
                height: gridTileHeight,
                marginRight: isLastCol ? 0 : gridGap,
                marginBottom: isLastRow ? 0 : gridGap
              }}
              tileWidth={gridTileWidth}
              tileHeight={gridTileHeight}
              noVideoBg={noVideoBg}
              micMutedColor={micMutedColor}
              reactions={floatingReactions.filter((r) => r.fromSessionId === item.session_id)}
              showPinBadge={false}
              showSingleTileCard={showSingleTileCard}
              showActiveSpeakerRing={showActiveSpeakerRing}
              onLongPressAt={(x, y) => onTileLongPress(item.session_id, x, y)}
            />
          );
        })}
      </View>
    );
  }

  const filmstripTileWidth = filmstripBottom
    ? FILMSTRIP_TILE_WIDTH
    : FILMSTRIP_TILE_WIDTH - 8;

  const filmstripContent = unpinnedParticipants.map((item) => {
    const showActiveSpeakerRing =
      item.session_id === activeSpeakerSessionId &&
      item.audio === true &&
      participantsLength > 1;
    return (
      <RemoteParticipantTile
        key={tileKey(item)}
        item={item}
        style={filmstripBottom ? styles.filmstripTileBottom : styles.filmstripTileSide}
        tileWidth={filmstripTileWidth}
        tileHeight={FILMSTRIP_TILE_HEIGHT}
        noVideoBg={noVideoBg}
        micMutedColor={micMutedColor}
        reactions={floatingReactions.filter((r) => r.fromSessionId === item.session_id)}
        showPinBadge={false}
        reactionCompact
        showActiveSpeakerRing={showActiveSpeakerRing}
        onLongPressAt={(x, y) => onTileLongPress(item.session_id, x, y)}
      />
    );
  });

  return (
    <View style={[styles.spotlightRoot, filmstripBottom ? styles.spotlightRootPortrait : styles.spotlightRootLandscape]}>
      <View style={[styles.spotlightMain, { padding: gridPadding }]}>
        <View
          style={styles.spotlightMeasure}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setSpotlightInner((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
          }}
        >
          <SpotlightCells
            pinned={pinnedParticipants}
            noVideoBg={noVideoBg}
            micMutedColor={micMutedColor}
            activeSpeakerSessionId={activeSpeakerSessionId}
            participantsLength={participantsLength}
            floatingReactions={floatingReactions}
            onTileLongPress={onTileLongPress}
            spotlightInnerWidth={spotlightInner.w}
            spotlightInnerHeight={spotlightInner.h}
          />
        </View>
      </View>
      {filmstripBottom ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.filmstripScrollBottom}
          contentContainerStyle={styles.filmstripContentBottom}
        >
          {filmstripContent}
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.filmstripScrollSide}
          contentContainerStyle={styles.filmstripContentSide}
        >
          {filmstripContent}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  remoteGrid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  tile: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    position: "relative"
  },
  tileMediaStack: {
    flex: 1,
    width: "100%",
    height: "100%"
  },
  tileLongPressCapture: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 15
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
    backgroundColor: "rgba(15, 23, 42, 0.55)"
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
  pinBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 7,
    padding: 4,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.45)"
  },
  spotlightRoot: {
    flex: 1,
    minHeight: 0,
    minWidth: 0
  },
  spotlightRootPortrait: {
    flexDirection: "column"
  },
  spotlightRootLandscape: {
    flexDirection: "row"
  },
  spotlightMain: {
    flex: 1,
    minHeight: 0,
    minWidth: 0
  },
  spotlightMeasure: {
    flex: 1,
    minHeight: 0,
    minWidth: 0
  },
  spotlightTwoPinCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 0,
    minWidth: 0
  },
  spotlightTwoPinRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPOTLIGHT_GAP,
    width: "100%"
  },
  spotlightRow: {
    flex: 1,
    flexDirection: "row",
    gap: SPOTLIGHT_GAP,
    minHeight: 0,
    minWidth: 0
  },
  spotlightCol: {
    flex: 1,
    flexDirection: "column",
    gap: SPOTLIGHT_GAP,
    minHeight: 0,
    minWidth: 0
  },
  spotlightThirdRow: {
    flex: 1,
    minHeight: 0,
    alignItems: "center",
    justifyContent: "center"
  },
  spotlightThirdInner: {
    flex: 1,
    width: "100%",
    maxWidth: "52%",
    minHeight: 0
  },
  filmstripScrollBottom: {
    maxHeight: FILMSTRIP_HEIGHT,
    flexGrow: 0
  },
  filmstripContentBottom: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    alignItems: "center"
  },
  filmstripScrollSide: {
    width: FILMSTRIP_WIDTH,
    flexGrow: 0,
    maxHeight: "100%"
  },
  filmstripContentSide: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 8,
    alignItems: "center"
  },
  filmstripTileBottom: {
    width: FILMSTRIP_TILE_WIDTH,
    height: FILMSTRIP_TILE_HEIGHT
  },
  filmstripTileSide: {
    width: FILMSTRIP_TILE_WIDTH - 8,
    height: FILMSTRIP_TILE_HEIGHT
  }
});
