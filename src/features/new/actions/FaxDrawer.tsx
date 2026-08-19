// React Imports
import React, { useState } from "react";
import {
  View,
  TouchableWithoutFeedback,
  Keyboard,
  TouchableOpacity,
  StyleSheet
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import DocumentPicker, {
  DocumentPickerResponse
} from "react-native-document-picker";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import { TextInput } from "shared/components/TextInput.tsx";
import { phoneNumberFormatter } from "shared/utils/utils.ts";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import Icon from "shared/components/Icon.tsx";
import { Button } from "shared/components/Button.tsx";
import { FileIcon } from "shared/components/FileIcon.tsx";
import { toast } from "@backpackapp-io/react-native-toast";
import { useDrawer } from "core/drawer/DrawerContext.tsx";
import { sendFax } from "shared/api/faxes/methods.ts";
import { Logger } from "shared/utils/Logger.ts";

export const FaxDrawer = () => {
  // Hooks
  const theme = useTheme();
  const logger = new Logger("FaxDrawer: ");
  const { user } = useSelector((state: State) => state.userReducer);
  const accessToken = useSelector(
    (state: State) => state.authReducer.accessToken
  );
  const { closeDrawer } = useDrawer();

  // Local State
  const [selectedFile, setSelectedFile] =
    useState<DocumentPickerResponse | null>(null);
  const [destinationNumber, setDestinationNumber] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Methods
  const handleFilePick = async () => {
    try {
      const result = await DocumentPicker.pickSingle({
        mode: "import",
        type: [DocumentPicker.types.pdf],
        copyTo: "cachesDirectory"
      });
      setSelectedFile(result);
    } catch (err) {
      if (!DocumentPicker.isCancel(err)) {
        logger.error("Error picking document:", err);
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
  };

  const handleSendFax = async () => {
    if (!selectedFile) {
      toast.error("Please select a file");
      return;
    }

    if (!destinationNumber) {
      toast.error("Please enter a destination number");
      return;
    }

    setIsLoading(true);

    try {
      // Get the file URI
      const uri = String(selectedFile.fileCopyUri);

      // Clean the destination number (remove formatting characters)
      const cleanDestinationNumber = destinationNumber.replace(/\D/g, "");

      if (!cleanDestinationNumber || cleanDestinationNumber.length < 10) {
        toast.error("Please enter a valid phone number");
        setIsLoading(false);
        return;
      }

      logger.debug("Sending fax with:", {
        uri,
        destinationNumber: cleanDestinationNumber
      });

      // Call sendFax with params and accessToken
      const response = await sendFax(
        { uri, destinationNum: cleanDestinationNumber },
        accessToken
      );

      logger.debug("Fax send response:", response);

      // Check if the response indicates success
      if (response?.status === "success" || response?.status === "Success") {
        setSelectedFile(null);
        setDestinationNumber("");
        closeDrawer();
        toast.success("Fax sent successfully");
      } else {
        // If status is not success, show error
        const errorMessage =
          response?.message || "Fax couldn't be sent. Please try again.";
        logger.error("Fax send failed:", errorMessage);
        toast.error(errorMessage);
      }
    } catch (error: any) {
      // Failure: don't clear the state, don't close drawer, show error toast
      const errorMessage =
        error?.message || error?.type || "Fax couldn't be sent";
      logger.error("Error sending fax:", error);
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const getFileSize = (size: number | null | undefined) => {
    if (!size) return "0 MB";
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Render Methods
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
        Fax
      </Text>
      <WhiteSpace
        style={[
          styles.divider,
          { borderColor: theme.colors["color-colors-border-border-secondary"] }
        ]}
      />
    </>
  );

  const renderFileUpload = () => (
    <TouchableOpacity
      onPress={handleFilePick}
      style={[
        styles.uploadContainer,
        { borderColor: theme.colors["color-colors-border-border-secondary"] }
      ]}
    >
      <View
        style={[
          styles.uploadIconContainer,
          { borderColor: theme.colors.borderColor }
        ]}
      >
        <Icon name={"upload-cloud-02"} />
      </View>
      <WhiteSpace height={18} />
      <View style={styles.uploadTextContainer}>
        <Text
          size={14}
          weight={"semiBold"}
          color={
            "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg"
          }
          style={styles.uploadText}
        >
          Tap to upload
        </Text>
        <WhiteSpace height={4} />
        <Text size={12} weight={"regular"} style={styles.uploadText}>
          PDF only
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderSelectedFile = () => (
    <View
      style={[
        styles.selectedFileContainer,
        { borderColor: theme.colors["color-colors-border-border-secondary"] }
      ]}
    >
      <View style={styles.fileInfoContainer}>
        <FileIcon
          fileName={selectedFile?.name || undefined}
          fileType={selectedFile?.type || undefined}
          iconSize={32}
        />
        <View style={styles.fileDetails}>
          <Text
            size={14}
            weight="medium"
            numberOfLines={2}
            style={styles.fileName}
            ellipsizeMode="tail"
          >
            {selectedFile?.name}
          </Text>
          <Text
            size={14}
            weight="regular"
            color="color-colors-text-text-tertiary"
          >
            {getFileSize(selectedFile?.size)}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={handleRemoveFile} style={styles.deleteButton}>
        <Icon
          name="trash-01"
          size={20}
          color={
            theme.colors[
              "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
            ]
          }
        />
      </TouchableOpacity>
    </View>
  );

  const renderSendButton = () => (
    <Button
      type="primary"
      onPress={handleSendFax}
      style={styles.sendButton}
      loading={isLoading}
    >
      Send
    </Button>
  );

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.container}>
        {renderHeader()}
        {user?.faxNumber ? (
          <View style={styles.contentContainer}>
            <View style={styles.toField}>
              <Text size={16} weight="medium" style={styles.toFieldLabel}>
                To:
              </Text>
              <TextInput
                variant="text"
                placeholder="Phone Number"
                placeholderSize={16}
                textWeight="medium"
                placeholderWeight="medium"
                placeholderColor={
                  "color-component-colors-components-buttons-tertiary-button-tertiary-fg"
                }
                value={phoneNumberFormatter(destinationNumber)}
                onChangeText={setDestinationNumber}
              />
            </View>
            <WhiteSpace
              style={[
                styles.divider,
                {
                  borderColor:
                    theme.colors["color-colors-border-border-secondary"]
                }
              ]}
            />
            <WhiteSpace height={28} />
            <View style={styles.sendingFromContainer}>
              <Text size={16} weight={"regular"}>
                Sending From:{" "}
                <Text weight={"semiBold"}>
                  {phoneNumberFormatter(user.faxNumber)}
                </Text>
              </Text>
            </View>
            <WhiteSpace height={28} />
            {selectedFile ? renderSelectedFile() : renderFileUpload()}
          </View>
        ) : (
          <View>
            <Text>You do not have faxing enabled on your account</Text>
          </View>
        )}
        {selectedFile && renderSendButton()}
      </View>
    </TouchableWithoutFeedback>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative"
  },
  contentContainer: {
    flex: 1
  },
  headerText: {
    fontWeight: "600",
    marginBottom: 20
  },
  divider: {
    borderStyle: "solid",
    borderWidth: 0.5
  },
  toField: {
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    paddingHorizontal: 28
  },
  toFieldLabel: {
    marginRight: 16
  },
  uploadContainer: {
    height: 126,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 28,
    paddingHorizontal: 28,
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center"
  },
  uploadTextContainer: {
    alignItems: "center",
    width: "100%"
  },
  uploadText: {
    textAlign: "center"
  },
  uploadIconContainer: {
    padding: 16,
    borderWidth: 1,
    borderRadius: 8
  },
  selectedFileContainer: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderWidth: 1,
    borderRadius: 12,
    marginHorizontal: 28
  },
  fileInfoContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12
  },
  fileDetails: {
    flex: 1,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  fileName: {
    flexShrink: 1,
    marginBottom: 4
  },
  sendingFromContainer: {
    paddingHorizontal: 28,
    alignItems: "flex-start"
  },
  deleteButton: {
    padding: 8
  },
  sendButtonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    borderTopWidth: 1
  },
  sendButton: {
    marginHorizontal: 28
  }
});
