// React Imports
import React, { useMemo } from "react";
import { useTheme } from "hooks/use-theme.ts";

// Type Imports
import { Image, StyleSheet, View } from "react-native";

// Utils & Constants
import { toPascalCase } from "shared/utils/utils.ts";
import * as LightThumbnails from "../../assets/thumbnail-placeholders/light";
import * as DarkThumbnails from "../../assets/thumbnail-placeholders/dark";

// Types
interface FileIconProps {
  fileName?: string;
  fileUrl?: string;
  fileType?: string;
  iconSize?: number;
  theme?: "light" | "dark";
}

export const FileIcon: React.FC<FileIconProps> = ({
  fileName,
  fileUrl,
  fileType,
  iconSize = 40,
  theme: themeOverride
}) => {
  // Hooks
  const theme = useTheme();

  // Constants
  const supportedExtensions = [
    "aep",
    "ai",
    "avi",
    "css",
    "csv",
    "dmg",
    "doc",
    "docx",
    "exe",
    "fig",
    "html",
    "indd",
    "java",
    "js",
    "json",
    "mkv",
    "mp3",
    "mp4",
    "mpeg",
    "pdf",
    "ppt",
    "pptx",
    "psd",
    "rar",
    "rss",
    "sql",
    "txt",
    "wav",
    "xls",
    "xlsx",
    "xml",
    "zip"
  ];

  const currentTheme = themeOverride || (theme.dark ? "dark" : "light");

  // Computed Values
  const fileExtension = useMemo(() => {
    if (!fileName) return null;
    return fileName.split(".").pop()?.toLowerCase() || null;
  }, [fileName]);

  const isImage = useMemo(() => {
    return fileType?.includes("image") || false;
  }, [fileType]);

  const thumbnailComponent = useMemo(() => {
    const thumbnails =
      currentTheme === "dark" ? DarkThumbnails : LightThumbnails;

    if (fileExtension && supportedExtensions.includes(fileExtension)) {
      const thumbnailName = toPascalCase(fileExtension);
      const ThumbnailComponent = (thumbnails as any)[thumbnailName];
      return ThumbnailComponent || (thumbnails as any).Default;
    }

    return (thumbnails as any).Default;
  }, [fileExtension, currentTheme, supportedExtensions]);

  // Handle Image Files
  if (isImage && fileUrl) {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: fileUrl }}
          style={[
            styles.fileImage,
            {
              width: iconSize,
              height: iconSize
            }
          ]}
          resizeMode="cover"
        />
      </View>
    );
  }

  // Handle All Other Files with Thumbnails
  const ThumbnailComponent = thumbnailComponent;

  return (
    <View style={styles.container}>
      <View style={[styles.thumbnailContainer, { width: iconSize, height: iconSize }]}>
        <ThumbnailComponent
          width={iconSize}
          height={iconSize}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingRight: 16,
    position: "relative"
  },
  fileImage: {
    borderRadius: 8
  },
  thumbnailContainer: {
    borderRadius: 8,
    overflow: "hidden"
  }
});
