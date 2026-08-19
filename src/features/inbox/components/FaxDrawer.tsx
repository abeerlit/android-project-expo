// React Imports
import React, { useState } from "react";
import { useSelector } from "react-redux";
import { useTheme } from "hooks/use-theme.ts";
import { Logger } from "shared/utils/Logger.ts";
import { padding, borderRadius } from "core/theme/theme.ts";
import { getContactName } from "features/inbox/utils/inbox-utils.ts";
import {
  formatRelativeTime,
  formatPreciseTime,
  phoneNumberFormatter
} from "shared/utils/utils.ts";

// Type Imports
import { Fax } from "shared/api/faxes/types.ts";

// Component Imports
import { State } from "store/types.ts";
import Icon from "shared/components/Icon.tsx";
import { Text } from "shared/components/Text.tsx";
import { Button } from "shared/components/Button.tsx";
import { FileIcon } from "shared/components/FileIcon.tsx";
import { downloadFax } from "shared/api/faxes/methods.ts";
import { Linking, TouchableOpacity, View, StyleSheet, ScrollView, Platform } from "react-native";
import ReactNativeBlobUtil from "react-native-blob-util";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { toast } from "@backpackapp-io/react-native-toast";

type FaxDrawerProps = {
  fax: Fax;
};

export const FaxDrawer = ({ fax }: FaxDrawerProps) => {
  const theme = useTheme();
  const logger = new Logger("Fax Drawer: ");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);

  const token = useSelector(
    ({ authReducer }: State) => authReducer.accessToken
  );
  const directory = useSelector(
    ({ directoryReducer }: State) => directoryReducer.directory
  );
  const personalContacts = useSelector(
    ({ directoryReducer }: State) => directoryReducer.personalContacts ?? []
  );

  const rawPhoneNumber =
    fax.direction === "OUT" ? fax.destNum : fax.sourceNum;

  const contactName =
    fax.direction === "OUT"
      ? getContactName(fax.destNum, fax.destNum, directory, personalContacts)
      : getContactName(fax.sourceNum, fax.sourceName, directory, personalContacts);

  // Format phone number with country code
  const phoneNumber = phoneNumberFormatter(rawPhoneNumber);

  // Check if contact name is just the formatted number (no contact found)
  const hasContact = contactName !== phoneNumber && contactName !== rawPhoneNumber;

  const getStatusColor = () => {
    switch (fax.status) {
      case "SUCCESS":
        return (
          theme.colors[
            "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success"
          ] || theme.colors.success || "#079455"
        );
      case "FAILED":
        return (
          theme.colors["color-colors-foreground-fg-error-primary"] ||
          theme.colors.danger ||
          "#D92D20"
        );
      case "SENDING":
      case "RETRYING":
        return (
          theme.colors["colors-foreground-fg-warning-secondary"] ||
          theme.colors.danger ||
          "#F79009"
        );
      default:
        return theme.colors["color-colors-text-text-tertiary"] || "#6B7280";
    }
  };

  const getStatusText = () => {
    switch (fax.status) {
      case "SUCCESS":
        return "Delivered";
      case "FAILED":
        return "Failed";
      case "SENDING":
        return "Sending";
      case "RETRYING":
        return "Retrying";
      default:
        return fax.status;
    }
  };

  // Preview fax - download and open with native viewer.
  const previewFax = async () => {
    setIsPreviewing(true);
    try {
      const link = await downloadFax(token, fax.id);
      if (!link) {
        logger.error("No link found for fax: ", fax.id);
        toast.error("Failed to preview fax");
        return;
      }

      const url = link.raw;
      const fileName = `fax_${fax.id}.pdf`;

      if (Platform.OS === "ios") {
        // Download file and open with native viewer.
        const { dirs } = ReactNativeBlobUtil.fs;
        const filePath = `${dirs.CacheDir}/${fileName}`;

        const res = await ReactNativeBlobUtil.config({
          fileCache: true,
          path: filePath
        }).fetch("GET", url);

        const downloadedPath = res.path();
        logger.debug("iOS: File downloaded to:", downloadedPath);

        await ReactNativeBlobUtil.ios.openDocument(downloadedPath);
      } else {
        // Android: Download file and open with native viewer.
        const { dirs } = ReactNativeBlobUtil.fs;
        const filePath = `${dirs.CacheDir}/${fileName}`;

        const res = await ReactNativeBlobUtil.config({
          fileCache: true,
          path: filePath
        }).fetch("GET", url);

        const downloadedPath = res.path();
        logger.debug("Android: File downloaded to:", downloadedPath);

        try {
          await ReactNativeBlobUtil.android.actionViewIntent(
            downloadedPath,
            "application/pdf"
          );
        } catch (actionViewError) {
          logger.error("actionViewIntent failed, trying alternative:", actionViewError);
          const fileUri = `file://${downloadedPath}`;
          const canOpen = await Linking.canOpenURL(fileUri);
          if (canOpen) {
            await Linking.openURL(fileUri);
          } else {
            await Linking.openURL(url);
          }
        }
      }
    } catch (e) {
      logger.error("Error previewing fax: ", e);
      toast.error("Failed to preview fax");
    } finally {
      setIsPreviewing(false);
    }
  };

  const downloadSelectedFax = async () => {
    setIsDownloading(true);
    try {
      const link = await downloadFax(token, fax.id);
      if (!link) {
        logger.error("No link found for fax: ", fax.id);
        toast.error("Failed to download fax");
        return;
      }
      await Linking.openURL(link.raw);
      toast.success("Fax downloaded successfully");
    } catch (e) {
      logger.error("Error downloading fax: ", e);
      toast.error("Failed to download fax");
    } finally {
      setIsDownloading(false);
    }
  };

  const renderHeader = () => (
    <>
      <WhiteSpace height={3} />
      <Text
        size={18}
        style={[
          styles.headerText,
          { color: theme.colors["color-colors-text-text-primary"] }
        ]}
      >
        Fax Details
      </Text>
      <WhiteSpace
        style={[
          styles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />
    </>
  );

  const renderFaxInfo = () => (
    <View style={styles.infoSection}>
      <View style={styles.infoRow}>
        <Text
          size={16}
          weight="medium"
          style={[
            styles.infoLabel,
            { color: theme.colors["color-colors-text-text-secondary"] }
          ]}
        >
          {fax.direction === "OUT" ? "To:" : "From:"}
        </Text>
        <View style={styles.infoValue}>
          {hasContact ? (
            <>
              <Text
                size={16}
                weight="semiBold"
                style={{
                  color: theme.colors["color-colors-text-text-primary"]
                }}
              >
                {contactName}
              </Text>
              <Text
                size={14}
                weight="regular"
                style={{
                  color: theme.colors["color-colors-text-text-tertiary"],
                  marginTop: 4
                }}
              >
                {phoneNumber}
              </Text>
            </>
          ) : (
            <Text
              size={16}
              weight="semiBold"
              style={{ color: theme.colors["color-colors-text-text-primary"] }}
            >
              {phoneNumber}
            </Text>
          )}
        </View>
      </View>

      <WhiteSpace
        style={[
          styles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />

      <View style={styles.metadataContainer}>
        <View style={styles.metadataRow}>
          <View style={styles.metadataItem}>
            <Icon
              name="calendar"
              size={16}
              color={theme.colors["color-colors-text-text-tertiary"]}
            />
            <Text
              size={14}
              weight="regular"
              style={{
                color: theme.colors["color-colors-text-text-tertiary"],
                marginLeft: 8
              }}
            >
              {formatPreciseTime(new Date(fax.date).getTime())}
            </Text>
          </View>
        </View>

        <View style={styles.metadataRow}>
          <View style={styles.metadataItem}>
            <Icon
              name="file-04"
              size={16}
              color={theme.colors["color-colors-text-text-tertiary"]}
            />
            <Text
              size={14}
              weight="regular"
              style={{
                color: theme.colors["color-colors-text-text-tertiary"],
                marginLeft: 8
              }}
            >
              {fax.pages || 0} {fax.pages === 1 ? "page" : "pages"}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: getStatusColor() + "20" }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getStatusColor() }
              ]}
            />
            <Text
              size={12}
              weight="semiBold"
              style={{ color: getStatusColor(), marginLeft: 6 }}
            >
              {getStatusText()}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderFaxDocument = () => (
    <TouchableOpacity
      style={[
        styles.documentContainer,
        {
          borderColor: theme.colors["color-colors-border-border-secondary"],
          backgroundColor:
            theme.colors["color-colors-background-bg-primary"] || "transparent"
        }
      ]}
      onPress={previewFax}
      activeOpacity={0.7}
      disabled={isPreviewing}
    >
      <View style={styles.documentInfo}>
        <FileIcon
          fileName="fax.pdf"
          fileType="application/pdf"
          iconSize={40}
        />
        <View style={styles.documentDetails}>
          <Text
            size={14}
            weight="medium"
            numberOfLines={1}
            style={[
              styles.documentName,
              { color: theme.colors["color-colors-text-text-primary"] }
            ]}
          >
            Fax Document
          </Text>
          <Text
            size={12}
            weight="regular"
            style={{
              color: theme.colors["color-colors-text-text-tertiary"],
              marginTop: 4
            }}
          >
            {fax.pages || 0} {fax.pages === 1 ? "page" : "pages"} •{" "}
            {formatRelativeTime(fax.date)}
          </Text>
        </View>
        <Icon
          name="arrow-right"
          size={20}
          color={theme.colors["color-colors-text-text-tertiary"]}
        />
      </View>
    </TouchableOpacity>
  );

  const renderActions = () => (
    <View style={styles.actionsContainer}>
      <Button
        type="outline"
        onPress={downloadSelectedFax}
        loading={isDownloading}
        containerStyle={styles.actionButton}
        icon={
          <Icon
            name="download-cloud-02"
            size={20}
            color={
              theme.colors[
                "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
              ]
            }
          />
        }
        iconSpacing={8}
        size={14}
        weight="semiBold"
      >
        Download
      </Button>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {renderHeader()}
      <View style={styles.content}>
        {renderFaxInfo()}
        <WhiteSpace height={24} />
        {renderFaxDocument()}
        <WhiteSpace height={24} />
        {renderActions()}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: padding["3xl"]
  },
  headerText: {
    fontWeight: "600",
    marginBottom: 20,
    paddingHorizontal: padding["3xl"]
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5
  },
  content: {
    paddingHorizontal: padding["3xl"]
  },
  infoSection: {
    marginTop: padding.xl
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: padding.lg
  },
  infoLabel: {
    width: 60,
    marginRight: padding.md
  },
  infoValue: {
    flex: 1
  },
  metadataContainer: {
    marginTop: padding.md
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: padding.sm
  },
  metadataItem: {
    flexDirection: "row",
    alignItems: "center"
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3
  },
  documentContainer: {
    borderWidth: 1,
    borderRadius: borderRadius.lg,
    padding: padding.xl,
    backgroundColor: "transparent"
  },
  documentInfo: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  documentDetails: {
    flex: 1,
    marginLeft: padding.md,
    justifyContent: "center"
  },
  documentName: {
    marginBottom: 4
  },
  actionsContainer: {
    marginTop: padding.md
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  }
});
