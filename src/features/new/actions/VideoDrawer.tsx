// React Imports
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { fontSize, padding } from "core/theme/theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import Clipboard from "@react-native-clipboard/clipboard";
import { toast } from "@backpackapp-io/react-native-toast";
import { useSelector } from "react-redux";
import { useNavigation } from "@react-navigation/native";
import { Logger } from "shared/utils/Logger.ts";
import { getOrganizationName } from "shared/branding/appBrand.ts";
import { Routes } from "core/navigation/types/types.ts";

// API Imports
import { createMeeting } from "shared/api/misc/create-meeting.ts";
import type { CreateMeetingResponse } from "shared/api/misc/types.ts";

// Type Imports
import { State } from "store/types.ts";
import { AuthParams } from "core/navigation/navigators/AuthenticatedStack.tsx";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import LoginBG from "assets/bg/bg_grid.svg";
import { ProfileGroup } from "shared/components/ProfileGroup.tsx";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import { MeetingInviteOthersDrawer } from "features/meeting/components/MeetingInviteOthersDrawer.tsx";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NavigationProp = NativeStackNavigationProp<AuthParams>;

type VideoDrawerMode = "create" | "join";

const normalizePastedMeetUrl = (raw: string): string | null => {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
};

export const VideoDrawer = () => {
  const theme = useTheme();
  const logger = new Logger("VideoDrawer");
  const { closeDrawer } = useDrawer();
  const navigation = useNavigation<NavigationProp>();
  const { width: windowWidth } = Dimensions.get("window");
  const insets = useSafeAreaInsets();


  const { user } = useSelector((state: State) => state.userReducer);
  const { accessToken } = useSelector((state: State) => state.authReducer);

  const [mode, setMode] = useState<VideoDrawerMode>("create");
  const [meetLink, setMeetLink] = useState("");
  const [lastMeeting, setLastMeeting] = useState<CreateMeetingResponse | null>(
    null
  );
  const [pastedUrl, setPastedUrl] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showInvitePicker, setShowInvitePicker] = useState(false);
  const joinLinkInputRef = useRef<TextInput>(null);

  const creatorDisplayName =
    user?.extName?.trim() || user?.peerName?.trim() || "You";

  const closeInvitePicker = useCallback(() => {
    setShowInvitePicker(false);
  }, []);

  const dismissJoinKeyboard = useCallback(() => {
    joinLinkInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const isLinkReady = Boolean(
    lastMeeting && meetLink.trim().length > 0 && !isCreating
  );

  const initializeMeeting = useCallback(async () => {
    if (!user || !accessToken) {
      logger.error("Missing user or access token");
      toast.error("Sign in required to create a meeting");
      return;
    }

    setIsCreating(true);
    setLastMeeting(null);
    setMeetLink("");
    setShowInvitePicker(false);

    try {
      const response = await createMeeting(
        {
          type: "onDemand",
          userId: user.id.toString(),
          tenantId: user.tenantId.toString(),
          ext: user.extNum
        },
        accessToken
      );

      logger.debug("Meeting created:", response);
      setLastMeeting(response);
      setMeetLink(response.meetURL);
    } catch (error) {
      logger.error("Error creating meeting:", error);
      setMeetLink("");
      toast.error("Failed to create meeting");
    } finally {
      setIsCreating(false);
    }
  }, [accessToken, logger, user]);

  const handleCopyLink = () => {
    if (!isLinkReady) return;
    Clipboard.setString(meetLink);
    toast.success("Meeting link copied to clipboard");
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getString();
      setPastedUrl(text.trim());
      if (text.trim()) {
        toast.success("Pasted from clipboard");
      }
    } catch (error) {
      logger.error("Clipboard read failed:", error);
      toast.error("Could not read clipboard");
    }
  };

  const handleJoinWithPastedUrl = () => {
    const url = normalizePastedMeetUrl(pastedUrl);
    if (!url) {
      toast.error("Paste a meeting link");
      return;
    }
    const lower = url.toLowerCase();
    const looksLikeMeeting =
      lower.includes("meet.") || lower.includes("daily.co") || lower.includes("voxo");
    if (!looksLikeMeeting) {
      toast.error(`Use a ${getOrganizationName()} or Daily meeting link`);
      return;
    }

    logger.debug("Join via pasted URL", { url });
    closeDrawer();
    navigation.navigate(Routes.Meetings, { meetURL: url });
  };

  const handleContinue = async () => {
    try {
      if (!isLinkReady) {
        toast.error("Meeting link is not ready yet");
        return;
      }
      if (!lastMeeting?.roomId || !lastMeeting?.token) {
        logger.error("Continue pressed but meeting payload missing", {
          hasLastMeeting: !!lastMeeting
        });
        toast.error("Meeting data is not ready");
        return;
      }

      closeDrawer();
      navigation.navigate(Routes.Meetings, {
        meetURL: meetLink,
        roomId: lastMeeting.roomId,
        meetingToken: lastMeeting.token,
        enableTranscription: lastMeeting.enableTranscription
      });
    } catch (error) {
      logger.error("Error opening in-app meeting:", error);
      toast.error("Failed to open meeting");
    }
  };

  const renderModeToggle = () => (
    <View style={styles.modeRow} collapsable={false}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: mode === "create" }}
        activeOpacity={0.75}
        hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
        style={[
          styles.modePill,
          mode === "create" && styles.modePillActive,
          {
            borderColor: theme.colors["color-colors-border-border-secondary"],
            backgroundColor:
              mode === "create"
                ? theme.colors["color-colors-background-bg-secondary"]
                : "transparent"
          }
        ]}
        onPress={() => {
          setMode("create");
          setPastedUrl("");
          setLastMeeting(null);
          setMeetLink("");
          setIsCreating(false);
          setShowInvitePicker(false);
        }}
      >
        <View pointerEvents="none" style={styles.modePillLabel}>
          <Text size={fontSize.sm} weight={mode === "create" ? "semiBold" : "regular"}>
            New meeting
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ selected: mode === "join" }}
        activeOpacity={0.75}
        hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
        style={[
          styles.modePill,
          mode === "join" && styles.modePillActive,
          {
            borderColor: theme.colors["color-colors-border-border-secondary"],
            backgroundColor:
              mode === "join"
                ? theme.colors["color-colors-background-bg-secondary"]
                : "transparent"
          }
        ]}
        onPress={() => {
          setMode("join");
          setPastedUrl("");
          setLastMeeting(null);
          setMeetLink("");
          setIsCreating(false);
          setShowInvitePicker(false);
        }}
      >
        <View pointerEvents="none" style={styles.modePillLabel}>
          <Text size={fontSize.sm} weight={mode === "join" ? "semiBold" : "regular"}>
            Join with link
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerWrap} pointerEvents="box-none">
      <WhiteSpace height={3} />
      <Text
        size={fontSize.lg}
        style={[
          styles.headerText,
          { color: theme.colors["color-colors-text-text-primary"] }
        ]}
      >
        Video
      </Text>
      {renderModeToggle()}
      <WhiteSpace
        style={[
          styles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />
    </View>
  );

  const renderBackground = () => (
    <View style={styles.backgroundContainer}>
      <LoginBG width={windowWidth} height={350} stroke={theme.colors.backgroundSvg} />
    </View>
  );

  const renderCreateContent = () => {
    const hasMeeting = Boolean(lastMeeting);
    return (
      <>
        <WhiteSpace height={padding["5xl"]} />
        <WhiteSpace height={padding["3xl"]} />
        <ProfileGroup />
        <View style={styles.contentContainer}>
          <Text size={fontSize.lg} weight={"semiBold"} style={styles.contentTitle}>
            {hasMeeting ? "Meeting ready" : "New video meeting"}
          </Text>
          {hasMeeting ? (
            <Text size={fontSize.sm} weight={"regular"} style={styles.contentText}>
              Invite people in chat before you join, share the link below, or tap
              Continue to enter the meeting. You can also create meetings in{" "}
              <Text color={"color-colors-text-text-brand-secondary"} weight={"medium"}>
                Google
              </Text>{" "}
              and{" "}
              <Text weight={"medium"} color={"color-colors-text-text-brand-secondary"}>
                Microsoft
              </Text>{" "}
              Calendar.
            </Text>
          ) : (
            <Text size={fontSize.sm} weight={"regular"} style={styles.contentText}>
              Tap <Text weight="medium">Create meeting</Text> when you are ready.
              Nothing is created until you confirm.
            </Text>
          )}
        </View>
      </>
    );
  };

  const renderJoinContent = () => (
    <Pressable
      style={styles.joinKeyboardDismissArea}
      onPress={dismissJoinKeyboard}
      accessible={false}
    >
      <WhiteSpace height={padding["3xl"]} />
      <View style={styles.contentContainer}>
        <Text size={fontSize.lg} weight="semiBold" style={styles.contentTitle}>
          Join with link
        </Text>
        <Text size={fontSize.sm} weight="regular" style={styles.contentText}>
          Paste a meeting URL (for example from <Text weight="medium">meet.voxo.co</Text>{" "}
          or chat), then tap Join.
        </Text>
        <TextInput
          ref={joinLinkInputRef}
          value={pastedUrl}
          onChangeText={setPastedUrl}
          placeholder="https://meet.voxo.co/?…"
          placeholderTextColor={theme.colors["colors-text-text-placeholder"]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          multiline
          numberOfLines={3}
          style={[
            styles.pasteInput,
            {
              color: theme.colors["color-colors-text-text-primary"],
              borderColor: theme.colors["color-colors-border-border-disabled-subtle"],
              backgroundColor: theme.colors["color-colors-background-bg-primary"]
            }
          ]}
        />
        <TouchableOpacity
          onPress={() => {
            void handlePasteFromClipboard();
          }}
          style={styles.pasteClipboardRow}
        >
          <Icon
            name="copy-01"
            size={18}
            stroke={
              theme.colors[
                "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
              ]
            }
          />
          <Text
            size={fontSize.sm}
            weight="medium"
            color="color-colors-text-text-brand-secondary"
          >
            Paste from clipboard
          </Text>
        </TouchableOpacity>
      </View>
    </Pressable>
  );

  const renderLinkSection = () => (
    <View style={styles.linkSection}>
      <Text size={fontSize.sm} weight={"medium"} style={styles.linkLabel}>
        Share link
      </Text>
      <View style={styles.linkContainer}>
        <Text
          size={fontSize.md}
          weight={"regular"}
          style={[
            styles.linkText,
            {
              color: theme.colors["color-colors-text-text-secondary"],
              borderColor: theme.colors["color-colors-border-border-disabled-subtle"]
            }
          ]}
        >
          {meetLink || "—"}
        </Text>
        <TouchableOpacity
          onPress={handleCopyLink}
          disabled={!isLinkReady}
          style={{ opacity: isLinkReady ? 1 : 0.4 }}
        >
          <Icon
            name="copy-01"
            size={20}
            stroke={
              theme.colors[
                "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
              ]
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderButtons = () => {
    if (mode === "join") {
      return (
        <View style={[styles.buttonContainer,{marginBottom: insets.bottom }]}>
          <Button type="outline" onPress={closeDrawer} containerStyle={styles.button}>
            Close
          </Button>
          <Button
            type="primary"
            onPress={handleJoinWithPastedUrl}
            containerStyle={styles.button}
            disabled={!pastedUrl.trim()}
          >
            Join
          </Button>
        </View>
      );
    }

    if (!lastMeeting) {
      return (
        <View style={[styles.buttonContainer,{marginBottom: insets.bottom }]}>
          <Button type="outline" onPress={closeDrawer} containerStyle={styles.button}>
            Close
          </Button>
          <Button
            type="primary"
            onPress={() => {
              void initializeMeeting();
            }}
            containerStyle={styles.button}
            loading={isCreating}
            disabled={!user || !accessToken || isCreating}
          >
            Create meeting
          </Button>
        </View>
      );
    }

    const tripleButtonProps = {
      containerStyle: styles.buttonTriple,
      size: fontSize.sm,
      numberOfLines: 1 as const,
      adjustsFontSizeToFit: true,
      minimumFontScale: 0.85
    };

    return (
      <View
        style={[
          styles.buttonContainer,
          styles.buttonContainerTriple,
          { marginBottom: insets.bottom }
        ]}
      >
        <Button type="outline" onPress={closeDrawer} {...tripleButtonProps}>
          Close
        </Button>
        <Button
          type="outline"
          onPress={() => setShowInvitePicker(true)}
          disabled={!isLinkReady}
          {...tripleButtonProps}
        >
          Invite
        </Button>
        <Button
          type="primary"
          onPress={handleContinue}
          disabled={!isLinkReady}
          {...tripleButtonProps}
        >
          Continue
        </Button>
      </View>
    );
  };

  const renderInvitePicker = () => {
    if (!lastMeeting) return null;
    return (
      <View style={styles.invitePickerWrap}>
        <MeetingInviteOthersDrawer
          meetURL={meetLink}
          dialInNum={lastMeeting.dialInNum}
          pin={lastMeeting.pin}
          roomId={lastMeeting.roomId}
          token={lastMeeting.token}
          creatorName={creatorDisplayName}
          appearance="app"
          onBack={closeInvitePicker}
          onClose={closeInvitePicker}
        />
      </View>
    );
  };

  const drawerSheetBg = theme.colors["color-colors-background-bg-secondary"];

  if (showInvitePicker && lastMeeting) {
    return (
      <View
        style={[
          styles.container,
          styles.containerInviteSheet,
          { backgroundColor: drawerSheetBg }
        ]}
      >
        {renderInvitePicker()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {renderHeader()}
      <View style={styles.mainContent} collapsable={false}>
        {renderBackground()}
        {mode === "create" ? renderCreateContent() : renderJoinContent()}
        {mode === "create" && lastMeeting ? renderLinkSection() : null}
      </View>
      {renderButtons()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    flex: 1
  },
  containerInviteSheet: {
    paddingHorizontal: 0
  },
  headerWrap: {
    zIndex: 50,
    elevation: 50
  },
  headerText: {
    fontWeight: "600",
    marginBottom: 12
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12
  },
  modePill: {
    width: "48%",
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  modePillActive: {},
  modePillLabel: {
    alignItems: "center",
    justifyContent: "center"
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5
  },
  mainContent: {
    flex: 1,
    zIndex: 0,
    overflow: "hidden"
  },
  joinKeyboardDismissArea: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%"
  },
  backgroundContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 0,
    pointerEvents: "none"
  },
  contentContainer: {
    paddingTop: padding["3xl"],
    paddingHorizontal: padding["3xl"]
  },
  contentTitle: {
    marginBottom: padding.xs
  },
  contentText: {
    lineHeight: fontSize.lg,
    marginBottom: padding.md
  },
  pasteInput: {
    minHeight: 88,
    padding: padding.md,
    borderWidth: 1,
    borderRadius: 12,
    textAlignVertical: "top",
    fontSize: fontSize.sm
  },
  pasteClipboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: padding.md
  },
  linkSection: {
    marginTop: padding["4xl"],
    alignItems: "flex-start"
  },
  linkLabel: {
    marginBottom: padding.sm
  },
  linkContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: padding.lg
  },
  linkText: {
    flex: 1,
    textAlign: "left",
    padding: padding.lg,
    borderWidth: 1,
    borderRadius: 12
  },
  buttonContainer: {
    flexDirection: "row",
    gap: padding.md,
    paddingVertical: padding.xl,
    marginTop: "auto"
  },
  buttonContainerTriple: {
    gap: 8,
    paddingHorizontal: 0
  },
  button: {
    flex: 1
  },
  buttonTriple: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
    paddingVertical: 10
  },
  invitePickerWrap: {
    flex: 1
  }
});
