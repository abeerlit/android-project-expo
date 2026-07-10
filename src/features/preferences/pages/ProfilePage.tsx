import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Alert
} from "react-native";
import { useSelector, useDispatch } from "react-redux";
import { State } from "store/types.ts";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import Icon from "shared/components/Icon.tsx";
import { Avatar } from "shared/components/Avatar.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { toast } from "@backpackapp-io/react-native-toast";
import { Logger } from "shared/utils/Logger.ts";
import ImagePicker from "react-native-image-crop-picker";
import { patchUserAvatar, patchUserBanner } from "shared/api/users/methods.ts";
import * as userActions from "store/users/actions.ts";
import * as directoryActions from "store/directory/actions.ts";
import LinearGradient from "react-native-linear-gradient";
import { formatPhoneNumber } from "shared/utils/formatters.ts";
import { useSendbirdContext } from "features/chat/utils/SendbirdContext.ts";
import { updateUserInSendbird } from "shared/api/chat/methods.ts";
import { ProfileImageOptionsDialog, BannerImageOptionsDialog } from "shared/components/ImageOptionsDialog.tsx";

const logger = new Logger("ProfilePage");

const COVER_HEIGHT = 90;
const AVATAR_SIZE = 80;

type ViewingImage = "avatar" | "banner" | null;

const ProfilePage: React.FC = () => {
  const theme = useTheme();
  const dispatch = useDispatch();

  const { user } = useSelector((state: State) => state.userReducer);
  const { accessToken } = useSelector((state: State) => state.authReducer);
  const { companyContacts } = useSelector(
    (state: State) => state.directoryReducer
  );
  const { sendbirdInstance } = useSendbirdContext();

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [viewingImage, setViewingImage] = useState<ViewingImage>(null);
  const [showProfileOptionsDialog, setShowProfileOptionsDialog] = useState(false);
  const [showBannerOptionsDialog, setShowBannerOptionsDialog] = useState(false);
  const isUploading = isUploadingAvatar || isUploadingBanner;

  useEffect(() => {
    dispatch({ type: userActions.REFRESH_USER_PROFILE });
  }, [dispatch]);

  const uploadAvatar = async (file: {
    path: string;
    mime: string;
    filename?: string;
  }) => {
    if (!accessToken) return;
    const formData = new FormData();
    formData.append("avatar", {
      uri: file.path,
      type: file.mime,
      name: file.filename || "avatar.jpg"
    } as any);
    const res = await patchUserAvatar(formData, accessToken);
    if (!res?.avatarPath) return;
    dispatch({
      type: userActions.UPDATE_USER,
      payload: {
        avatarPath: res.avatarPath,
        profileMediaVersion: Date.now()
      } as any
    });
    if (user?.id) {
      try {
        await updateUserInSendbird(
          user.id.toString(),
          user?.extName || user?.email || "User",
          res.avatarPath
        );
        if (
          sendbirdInstance?.currentUser &&
          typeof (sendbirdInstance.currentUser as any)
            .updateCurrentUserInfo === "function"
        ) {
          await (sendbirdInstance.currentUser as any).updateCurrentUserInfo({
            profileUrl: res.avatarPath,
            nickname: user?.extName || user?.email || "User"
          });
        }
      } catch (e) {
        logger.error("Sendbird avatar update failed", e);
      }
      dispatch({
        type: directoryActions.UPDATE_COMPANY_CONTACT,
        payload: {
          userId: user.id,
          updates: {
            avatarPath: res.avatarPath,
            avatarThumbnailPath: res.avatarPath
          }
        }
      });
    }
    dispatch({ type: directoryActions.FETCH_COMPANY_CONTACTS });
    toast.success("Profile picture updated");
  };

  const uploadBanner = async (file: {
    path: string;
    mime: string;
    filename?: string;
  }) => {
    if (!accessToken) return;
    const formData = new FormData();
    formData.append("banner", {
      uri: file.path,
      type: file.mime,
      name: file.filename || "banner.jpg"
    } as any);
    const res = await patchUserBanner(formData, accessToken);
    if (!res?.coverPhoto) return;
    dispatch({
      type: userActions.UPDATE_USER,
      payload: {
        coverPhoto: res.coverPhoto,
        profileMediaVersion: Date.now()
      } as any
    });
    toast.success("Banner updated");
  };

  const handlePickAvatar = async () => {
    try {
      const image = await ImagePicker.openPicker({
        width: 400,
        height: 400,
        cropping: true,
        cropperCircleOverlay: false,
        compressImageQuality: 0.8,
        includeBase64: false,
        mediaType: "photo"
      });
      setShowProfileOptionsDialog(false);
      setIsUploadingAvatar(true);
      await uploadAvatar(image);
    } catch (err: any) {
      if (err?.message !== "User cancelled image selection") {
        logger.error("Pick avatar", err);
        toast.error("Failed to select image");
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCaptureAvatar = async () => {
    try {
      const image = await ImagePicker.openCamera({
        width: 400,
        height: 400,
        cropping: true,
        cropperCircleOverlay: false,
        compressImageQuality: 0.8,
        includeBase64: false,
        mediaType: "photo"
      });
      setShowProfileOptionsDialog(false);
      setIsUploadingAvatar(true);
      await uploadAvatar(image);
    } catch (err: any) {
      if (err?.message !== "User cancelled image selection") {
        logger.error("Capture avatar", err);
        toast.error("Failed to capture photo");
      }
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handlePickBanner = async () => {
    try {
      const image = await ImagePicker.openPicker({
        width: 800,
        height: 400,
        cropping: true,
        cropperCircleOverlay: false,
        compressImageQuality: 0.8,
        includeBase64: false,
        mediaType: "photo"
      });
      setShowBannerOptionsDialog(false);
      setIsUploadingBanner(true);
      await uploadBanner(image);
    } catch (err: any) {
      if (err?.message !== "User cancelled image selection") {
        logger.error("Pick banner", err);
        toast.error("Failed to select image");
      }
    } finally {
      setIsUploadingBanner(false);
    }
  };

  const handleCaptureBanner = async () => {
    try {
      const image = await ImagePicker.openCamera({
        width: 800,
        height: 400,
        cropping: true,
        cropperCircleOverlay: false,
        compressImageQuality: 0.8,
        includeBase64: false,
        mediaType: "photo"
      });
      setShowBannerOptionsDialog(false);
      setIsUploadingBanner(true);
      await uploadBanner(image);
    } catch (err: any) {
      if (err?.message !== "User cancelled image selection") {
        logger.error("Capture banner", err);
        toast.error("Failed to capture photo");
      }
    } finally {
      setIsUploadingBanner(false);
    }
  };

      const openProfileOptions = () => {
        if (Platform.OS === "ios") {
          const buttons: any[] = [
            {
              text: "Upload from gallery",
              onPress: handlePickAvatar
            },
            {
              text: "Take photo",
              onPress: handleCaptureAvatar
            }
          ];

          if (user?.avatarPath) {
            buttons.push({
              text: "View current",
              onPress: () => setViewingImage("avatar")
            });
          }

          buttons.push({
            text: "Cancel",
            style: "cancel"
          });

          Alert.alert("Profile picture", "", buttons);
        } else {
          setShowProfileOptionsDialog(true);
        }
      };

    const openBannerOptions = () => {
      if (Platform.OS === "ios") {
        const buttons: any[] = [
          {
            text: "Upload from gallery",
            onPress: handlePickBanner
          },
          {
            text: "Take photo",
            onPress: handleCaptureBanner
          }
        ];

        if (user?.coverPhoto) {
          buttons.push({
            text: "View current",
            onPress: () => setViewingImage("banner")
          });
        }

        buttons.push({
          text: "Cancel",
          style: "cancel"
        });

        Alert.alert("Banner image", "", buttons);
      } else {
        setShowBannerOptionsDialog(true);
      }
    };

  const userName = user?.email || user?.extName || "User";

  const userContact = companyContacts.find(
    (contact) => contact.extId === user?.extId
  );
  const directDial = userContact?.directDials?.[0] || null;
  const branchName = user?.branchName || "Default";

  const v = (user as any)?.profileMediaVersion;
  const avatarUri = user?.avatarPath
    ? v
      ? `${user.avatarPath}?v=${v}`
      : user.avatarPath
    : undefined;
  const coverUri = user?.coverPhoto
    ? v
      ? `${user.coverPhoto}?v=${v}`
      : user.coverPhoto
    : undefined;

  const viewModalUri =
    viewingImage === "avatar"
      ? (avatarUri ?? user?.avatarPath)
      : viewingImage === "banner"
        ? (coverUri ?? user?.coverPhoto)
        : null;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors["color-colors-background-bg-primary"] }
      ]}
    >
  <ScrollView>
  {/* Cover + avatar header */}
  <View style={styles.profileHeaderWrapper}>
    {/* Banner - whole area clickable */}
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={openBannerOptions}
      disabled={isUploading}
      style={styles.coverWrapper}
    >
      {coverUri ? (
        <Image source={{ uri: coverUri }} style={styles.coverPhoto} />
      ) : (
        <LinearGradient
          colors={["#C4B5FD", "#93C5FD"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.coverPhoto}
        />
      )}
    </TouchableOpacity>

    {/* Banner edit icon */}
    <TouchableOpacity
      style={[
        styles.iconOverlay,
        styles.bannerIconOverlay,
        { backgroundColor: theme.colors["color-colors-background-bg-primary"] }
      ]}
      onPress={openBannerOptions}
      disabled={isUploading}
    >
      {isUploadingBanner ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <Icon
          name="edit-05"
          size={20}
          color={theme.colors["color-colors-text-text-primary"]}
        />
      )}
    </TouchableOpacity>

    {/* Avatar - whole area clickable */}
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={openProfileOptions}
      disabled={isUploading}
      style={styles.avatarWrapper}
    >
      <View
        style={[
          styles.avatarBorder,
          { backgroundColor: theme.colors["color-colors-background-bg-primary"] }
        ]}
      >
        <Avatar
          source={avatarUri}
          name={userName}
          size={AVATAR_SIZE}
          borderRadius={borderRadius.lg}
        />

        {/* Avatar icon overlay */}
        <View
          style={[
            styles.iconOverlay,
            styles.profileIconOverlay,
            { backgroundColor: theme.colors["color-colors-background-bg-primary"] }
          ]}
        >
          {isUploadingAvatar ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Icon
              name="user-01"
              size={18}
              color={theme.colors["color-colors-text-text-primary"]}
            />
          )}
        </View>
      </View>
    </TouchableOpacity>
  </View>

  {/* User Info Section */}
  <View style={styles.userInfoSection}>
    <View style={styles.nameRow}>
      <Text size={fontSize["2xl"]} weight="semiBold">
        {user?.extName || "User"}
      </Text>
      <View
        style={[
          styles.statusDot,
          { backgroundColor: theme.colors.success }
        ]}
      />
    </View>

    <WhiteSpace height={padding.lg} />

    {/* Local Time */}
    <View style={styles.infoRow}>
      <Icon
        name="clock"
        size={20}
        color={theme.colors["color-colors-text-text-tertiary"]}
      />
      <Text
        size={fontSize.md}
        weight="medium"
        style={{
          marginLeft: padding.sm,
          color: theme.colors["color-colors-text-text-primary"]
        }}
      >
        {new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true
        })}{" "}
        local time
      </Text>
    </View>

    <WhiteSpace height={padding.xl} />

    {/* Separator */}
    <View
      style={[
        styles.separator,
        { backgroundColor: theme.colors["color-colors-border-border-secondary"] }
      ]}
    />

    <WhiteSpace height={padding.xl} />

    {/* Email */}
    <View style={styles.detailRow}>
      <View style={[styles.iconCircle, { backgroundColor: "#F3F4F6" }]}>
        <Icon
          name="mail-03"
          size={24}
          color={theme.colors["color-colors-text-text-tertiary"]}
        />
      </View>
      <View style={styles.detailText}>
        <Text size={fontSize.sm} weight="semiBold" style={{ marginBottom: 4 }}>
          Email Address
        </Text>
        <Text size={fontSize.sm}>{user?.email || "Not available"}</Text>
      </View>
    </View>

    <WhiteSpace height={padding.lg} />

    {/* Extension Number */}
    <View style={styles.detailRow}>
      <View style={[styles.iconCircle, { backgroundColor: "#DBEAFE" }]}>
        <Icon name="phone" size={24} color="#3B82F6" />
      </View>
      <View style={styles.detailText}>
        <Text size={fontSize.sm} weight="semiBold" style={{ marginBottom: 4 }}>
          Extension Number
        </Text>
        <Text size={fontSize.sm}>
          {user?.extNum || user?.extName || "Not available"}
        </Text>
      </View>
    </View>

    <WhiteSpace height={padding.lg} />

    {/* Direct Dial */}
    <View style={styles.detailRow}>
      <View style={[styles.iconCircle, { backgroundColor: "#FEF3C7" }]}>
        <Icon name="hash-02" size={24} color="#F59E0B" />
      </View>
      <View style={styles.detailText}>
        <Text size={fontSize.sm} weight="semiBold" style={{ marginBottom: 4 }}>
          Direct Dial
        </Text>
        <Text size={fontSize.sm}>
          {directDial ? formatPhoneNumber(directDial) : "Not available"}
        </Text>
      </View>
    </View>

    <WhiteSpace height={padding.lg} />

    {/* Branch */}
    <View style={styles.detailRow}>
      <View style={[styles.iconCircle, { backgroundColor: "#D1FAE5" }]}>
        <Icon name="building-04" size={24} color="#10B981" />
      </View>
      <View style={styles.detailText}>
        <Text size={fontSize.sm} weight="semiBold" style={{ marginBottom: 4 }}>
          Branch
        </Text>
        <Text size={fontSize.sm}>{branchName}</Text>
      </View>
    </View>

    <WhiteSpace height={padding["3xl"]} />
  </View>
</ScrollView>


      {/* View image modal */}
      <Modal
        visible={!!viewingImage}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingImage(null)}
      >
        <View style={styles.viewModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setViewingImage(null)}
          />
          <TouchableOpacity
            style={styles.viewModalContent}
            activeOpacity={1}
            onPress={() => {}}
          >
            {viewModalUri ? (
              <Image
                source={{ uri: viewModalUri }}
                style={
                  viewingImage === "avatar"
                    ? styles.viewModalAvatar
                    : styles.viewModalBanner
                }
                resizeMode={viewingImage === "avatar" ? "cover" : "contain"}
              />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.viewModalClose,
              { backgroundColor: theme.colors["color-colors-background-bg-primary"] }
            ]}
            onPress={() => setViewingImage(null)}
          >
            <Icon
              name="x-close"
              size={24}
              color={theme.colors["color-colors-text-text-primary"]}
            />
          </TouchableOpacity>
        </View>
      </Modal>

      <ProfileImageOptionsDialog
        visible={showProfileOptionsDialog}
        onClose={() => setShowProfileOptionsDialog(false)}
        hasCurrentImage={!!user?.avatarPath}
        onUpload={handlePickAvatar}
        onTakePhoto={handleCaptureAvatar}
        onViewCurrent={() => setViewingImage("avatar")}
      />
      <BannerImageOptionsDialog
        visible={showBannerOptionsDialog}
        onClose={() => setShowBannerOptionsDialog(false)}
        hasCurrentImage={!!user?.coverPhoto}
        onUpload={handlePickBanner}
        onTakePhoto={handleCaptureBanner}
        onViewCurrent={() => setViewingImage("banner")}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  profileHeaderWrapper: {
    position: "relative",
    width: "100%"
  },
  coverWrapper: {
    width: "100%"
  },
  coverPhoto: {
    width: "100%",
    height: COVER_HEIGHT
  },
  avatarWrapper: {
    marginTop: -(AVATAR_SIZE / 2),
    paddingLeft: padding["3xl"],
    alignSelf: "flex-start",
    zIndex: 10
  },
  avatarBorder: {
    position: "relative",
    width: AVATAR_SIZE + 8,
    height: AVATAR_SIZE + 8,
    borderRadius: borderRadius.lg,
    padding: 4,
    alignSelf: "flex-start"
  },
  iconOverlay: {
    position: "absolute",
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)"
  },
  profileIconOverlay: {
    bottom: 0,
    right: 0
  },
  bannerIconOverlay: {
    top: COVER_HEIGHT - 32 - padding.sm,
    right: padding["3xl"],
    zIndex: 11
  },
  profileAvatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: borderRadius.lg
  },
  userInfoSection: {
    paddingHorizontal: padding["3xl"],
    paddingTop: padding.md
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: padding.sm
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  separator: {
    height: 1,
    width: "100%"
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: padding.xl
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2
  },
  detailText: {
    flex: 1,
    alignItems: "flex-start"
  },
  viewModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    justifyContent: "center",
    alignItems: "center",
    padding: padding.xl
  },
  viewModalContent: {
    width: "100%",
    maxWidth: 320,
    alignSelf: "center",
    alignItems: "center"
  },
  viewModalAvatar: {
    width: 280,
    height: 280,
    borderRadius: borderRadius.lg
  },
  viewModalBanner: {
    width: "100%",
    aspectRatio: 2,
    borderRadius: borderRadius.lg
  },
  viewModalClose: {
    position: "absolute",
    top: 56,
    right: padding.xl,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center"
  }
});

export default ProfilePage;
