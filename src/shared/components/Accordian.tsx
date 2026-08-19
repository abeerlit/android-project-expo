import React, { useState, ReactNode, useMemo } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  LayoutAnimation,
  Platform,
  UIManager,
  StyleProp,
  ViewStyle
} from "react-native";
import { useTheme } from "hooks/use-theme.ts";
import Icon from "./Icon";
import { Text } from "./Text";
import { fontSize, padding } from "core/theme/theme.ts";

// Enable layout animations for Android
if (Platform.OS === "android") {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

export interface AccordionProps {
  title: string;
  children: ReactNode;
  initiallyExpanded?: boolean;
  titleStyle?: StyleProp<ViewStyle>;
  containerStyle?: any;
  childrenContainerStyle?: any;
  iconSize?: number;
  rightComponent?: ReactNode;
  badgeCount?: number;
}

export default function Accordion({
  title,
  children,
  initiallyExpanded = false,
  titleStyle,
  containerStyle,
  childrenContainerStyle = {},
  iconSize = 24,
  rightComponent,
  badgeCount
}: AccordionProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const theme = useTheme();

  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  // Parse title to extract base title (remove any existing badge count from title)
  // Title format: "Section Name (5)" or "Section Name"
  const baseTitle = useMemo(() => {
    return title.replace(/\s*\(\d+\)$/, "").trim();
  }, [title]);

  // When expanded, show badge in title text. When collapsed, show styled badge
  const displayTitle = useMemo(() => {
    if (expanded && badgeCount !== undefined && badgeCount > 0) {
      return `${baseTitle} (${badgeCount})`;
    }
    return baseTitle;
  }, [baseTitle, badgeCount, expanded]);

  return (
    <View style={containerStyle}>
      <TouchableOpacity
        style={styles.header}
        onPress={toggleExpand}
        activeOpacity={0.7}
      >
        <Icon
          name={expanded ? "chevron-down" : "chevron-right"}
          type="outline"
          size={iconSize}
          style={{ color: theme.colors["color-colors-text-text-quarterary"] }}
        />
        <View style={styles.titleContainer}>
          <Text
            weight="bold"
            size={fontSize.sm}
            color={"color-colors-text-text-quarterary"}
            style={[styles.title, titleStyle]}
            align="left"
          >
            {displayTitle}
          </Text>
          {!expanded && badgeCount !== undefined && badgeCount > 0 && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: theme.colors["colors-border-border-error"],
                  borderColor: theme.colors["colors-border-border-error"]
                }
              ]}
            >
              <Text
                size={10}
                weight="semiBold"
                color={"colors-text-text-primary-on-brand"}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </Text>
            </View>
          )}
        </View>
        {rightComponent && (
          <View style={styles.rightComponentContainer}>{rightComponent}</View>
        )}
      </TouchableOpacity>

      {expanded && <View style={childrenContainerStyle}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: padding["2xl"],
    paddingBottom: 8,
    paddingHorizontal: padding.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  titleContainer: {
    flex: 1,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  title: {
    flexShrink: 1,
    flexWrap: "wrap"
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    borderWidth: 1.5
  },
  rightComponentContainer: {
    marginLeft: 10
  },
  content: {
    paddingHorizontal: 15,
    paddingBottom: 15
  }
});
