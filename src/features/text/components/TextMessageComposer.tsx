import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TextInput as RNTextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import Icon from "shared/components/Icon.tsx";
import { padding } from "core/theme/theme.ts";
import { launchImageLibrary } from "react-native-image-picker";
import { Logger } from "shared/utils/Logger.ts";

const logger = new Logger("TextMessageComposer");

interface TextMessageComposerProps {
  onSend: (message: string, mediaUris: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const TextMessageComposer: React.FC<TextMessageComposerProps> = ({
  onSend,
  disabled = false,
  placeholder = "Type a message..."
}) => {
  const theme = useTheme();
  const [message, setMessage] = useState("");
  const [mediaUris, setMediaUris] = useState<string[]>([]);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if ((!message.trim() && mediaUris.length === 0) || isSending || disabled) {
      return;
    }

    setIsSending(true);
    try {
      await onSend(message.trim(), mediaUris);
      setMessage("");
      setMediaUris([]);
    } catch (error) {
      logger.error("Error sending message:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleAttachMedia = () => {
    launchImageLibrary(
      {
        mediaType: "mixed",
        selectionLimit: 5,
        quality: 0.8
      },
      (response) => {
        if (response.didCancel || response.errorCode) {
          return;
        }

        if (response.assets) {
          const uris = response.assets
            .map((asset) => asset.uri)
            .filter((uri): uri is string => !!uri);
          setMediaUris([...mediaUris, ...uris]);
        }
      }
    );
  };

  const removeMedia = (index: number) => {
    setMediaUris(mediaUris.filter((_, i) => i !== index));
  };

  const canSend =
    (message.trim().length > 0 || mediaUris.length > 0) &&
    !isSending &&
    !disabled;

  const styles = StyleSheet.create({
    container: {
      backgroundColor: theme.colors["color-colors-background-bg-primary"],
      borderTopWidth: 1,
      borderTopColor: theme.colors["color-colors-border-border-secondary"],
      paddingBottom: Platform.OS === "ios" ? padding.lg : padding.md
    },
    mediaPreviewContainer: {
      paddingHorizontal: padding.lg,
      paddingTop: padding.md
    },
    mediaPreviewScroll: {
      flexDirection: "row"
    },
    mediaPreview: {
      width: 80,
      height: 80,
      borderRadius: 8,
      marginRight: padding.sm,
      position: "relative"
    },
    mediaImage: {
      width: "100%",
      height: "100%",
      borderRadius: 8
    },
    removeMediaButton: {
      position: "absolute",
      top: -8,
      right: -8,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.danger,
      alignItems: "center",
      justifyContent: "center"
    },
    inputContainer: {
      flexDirection: "row",
      alignItems: "flex-end",
      paddingHorizontal: padding.lg,
      paddingTop: padding.md
    },
    inputWrapper: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors["colors-background-bg-secondary"],
      borderRadius: 24,
      paddingHorizontal: padding.md,
      minHeight: 40
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: theme.colors["color-colors-text-text-primary"],
      maxHeight: 100,
      paddingVertical: Platform.OS === "ios" ? padding.sm : padding.xs
    },
    attachButton: {
      padding: padding.xs,
      marginRight: padding.xs
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: canSend
        ? theme.colors["colors-background-bg-brand-solid"]
        : theme.colors["color-colors-background-bg-disabled"],
      alignItems: "center",
      justifyContent: "center",
      marginLeft: padding.sm
    },
    disabledText: {
      textAlign: "center",
      padding: padding.md,
      color: theme.colors["color-colors-text-text-tertiary"],
      fontSize: 14
    }
  });

  if (disabled) {
    return (
      <View style={styles.container}>
        <Text style={styles.disabledText}>
          Select a number to start messaging
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {mediaUris.length > 0 && (
        <View style={styles.mediaPreviewContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.mediaPreviewScroll}
          >
            {mediaUris.map((uri, index) => (
              <View key={index} style={styles.mediaPreview}>
                <Image source={{ uri }} style={styles.mediaImage} />
                <TouchableOpacity
                  style={styles.removeMediaButton}
                  onPress={() => removeMedia(index)}
                >
                  <Icon name="x-close" size={12} color={theme.colors.white} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleAttachMedia}
          >
            <Icon
              name="Image"
              size={20}
              color={theme.colors["colors-foreground-fg-tertiary"]}
            />
          </TouchableOpacity>

          <RNTextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={theme.colors["colors-text-text-placeholder"]}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1600}
          />
        </View>

        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSend}
          disabled={!canSend}
        >
          <Icon
            name="Send03"
            size={20}
            color={canSend ? theme.colors.white : theme.colors.disabled}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};
