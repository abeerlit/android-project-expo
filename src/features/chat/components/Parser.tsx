import React, { useCallback, useMemo } from "react";
import { Linking, StyleSheet, View, ViewStyle } from "react-native";
import * as htmlparser2 from "htmlparser2";
import { toast } from "@backpackapp-io/react-native-toast";
import { useNavigation } from "@react-navigation/native";
import { useSelector } from "react-redux";
import { State } from "store/types";
import { useTheme } from "hooks/use-theme.ts";
import { Text } from "shared/components/Text.tsx";
import { borderRadius, fontSize, padding } from "core/theme/theme.ts";
import { Routes } from "core/navigation/types/types.ts";
import {
  isVoxoMeetUrl,
  normalizeMeetLinkUrl
} from "features/meeting/meetJoinUtils.ts";

// Props for the main Parser part
interface ParserProps {
  html: string;
  message?: {
    mentionedUserIds?: string[];
    sender?: {
      nickname?: string;
      plainProfileUrl?: string;
    };
  };
  containerStyle?: ViewStyle;
}

// Internal node structure used by the parser
interface Node {
  type: "text" | "tag";
  name?: string;
  attribs?: Record<string, string>;
  data?: string;
  children?: Node[];
}

// Style flags passed down the render tree
interface TextStyleProps {
  isBold?: boolean;
  isItalic?: boolean;
  isStrikethrough?: boolean;
  isMention?: boolean;
  isLink?: boolean;
  href?: string;
}

export const Parser: React.FC<ParserProps> = ({
  html,
  message,
  containerStyle
}) => {
  const theme = useTheme();
  const navigation = useNavigation();

  const handleLinkPress = useCallback(
    (href: string) => {
      const normalized = normalizeMeetLinkUrl(href);
      if (isVoxoMeetUrl(normalized)) {
        navigation.navigate(Routes.Meetings as never, {
          meetURL: normalized
        } as never);
        return;
      }
      void Linking.openURL(href).catch(() => {
        toast.error("Could not open link");
      });
    },
    [navigation]
  );

  // Access Redux directory reducer
  const directoryReducer = useSelector(
    ({ directoryReducer }: State) => directoryReducer
  );

  // Handle tap on a @mention
  const handleUserMentionPress = (mentionIndex: number) => {
    const userId = message?.mentionedUserIds?.[mentionIndex];
    if (!userId) return;

    const memberFromDirectory = directoryReducer?.directory?.find(
      (x) => String(x.userId) === userId && x.type === "company"
    );

    const contactDetail = memberFromDirectory || {
      name: message?.sender?.nickname,
      avatarPath: message?.sender?.plainProfileUrl
    };

    if (!contactDetail) {
      toast.error("Error loading user profile");
    }
  };

  // Core memoized logic for parsing and rendering HTML
  const parsedContent = useMemo(() => {
    if (!html) return null;

    // Parse raw HTML into a tree of nodes
    const parseHtml = (input: string): Node[] => {
      const result: Node[] = [];
      const nodeStack: Node[] = [];
      let mentionCount = 0;

      const parser = new htmlparser2.Parser(
        {
          onopentag(name, attribs) {
            const node: Node = {
              type: "tag",
              name,
              attribs,
              children: []
            };

            // Track mention indices
            if (name === "span" && attribs["data-type"] === "mention") {
              node.attribs!["mention-index"] = String(mentionCount++);
            }

            // Add node to tree
            const parent = nodeStack[nodeStack.length - 1];
            parent ? parent.children!.push(node) : result.push(node);
            nodeStack.push(node);
          },

          ontext(text) {
            const textNode: Node = { type: "text", data: text };
            const parent = nodeStack[nodeStack.length - 1];
            parent ? parent.children!.push(textNode) : result.push(textNode);
          },

          onclosetag() {
            nodeStack.pop();
          }
        },
        { decodeEntities: true }
      );

      parser.write(input);
      parser.end();
      return result;
    };

    // Recursively render a node tree
    const renderNode = (
      node: Node,
      index: number,
      parentStyles: TextStyleProps = {},
      parentKey: string = ""
    ): React.ReactNode[] => {
      const nodeKey = `${parentKey}-${index}`;

      if (node.type === "text") {
        const processedText = node.data!.replace(/\S{30,}/g, (match) =>
          match.replace(/(.{15})/g, "$1\u200B")
        );
        return [
          renderStyledText(processedText, `text-${nodeKey}`, parentStyles)
        ];
      }

      if (node.type === "tag" && node.name) {
        const currentStyles = { ...parentStyles };

        // Handle anchor tags
        if (node.name === "a" && node.attribs?.href) {
          const linkStyles = { ...currentStyles, isLink: true };
          return [
            <Text
              key={`link-${nodeKey}`}
              style={styles.link}
              lineHeight={fontSize["2xl"]}
              align="left"
              color="activeBlue"
              onPress={() => handleLinkPress(node.attribs!.href!)}
            >
              {node.children?.flatMap((child, i) =>
                renderNode(child, i, linkStyles, nodeKey)
              )}
            </Text>
          ];
        }

        // Handle mentions
        if (node.name === "span" && node.attribs?.["data-type"] === "mention") {
          const mentionIndex = parseInt(
            node.attribs["mention-index"] || "0",
            10
          );
          const mentionText = node.children
            ?.filter((child) => child.type === "text")
            .map((child) => child.data)
            .join("");

          const isChannelMention = mentionText === "@channel";

          return [
            <Text
              key={`mention-${nodeKey}`}
              size={fontSize.md}
              lineHeight={fontSize["2xl"]}
              align="left"
              style={[
                styles.mention,
                {
                  backgroundColor:
                    theme.colors[
                      "color-component-colors-utility-brand-utility-brand-50"
                    ],
                  borderColor:
                    theme.colors[
                      "color-component-colors-utility-brand-utility-brand-200"
                    ],
                  color:
                    theme.colors[
                      "color-component-colors-utility-brand-utility-brand-700"
                    ]
                }
              ]}
              {...(!isChannelMention && {
                onPress: () => handleUserMentionPress(mentionIndex),
                activeOpacity: 0.7
              })}
            >
              {mentionText}
            </Text>
          ];
        }

        // Handle inline formatting tags
        switch (node.name) {
          case "strong":
          case "b":
            currentStyles.isBold = true;
            break;
          case "em":
          case "i":
            currentStyles.isItalic = true;
            break;
          case "s":
            currentStyles.isStrikethrough = true;
            break;
        }

        // Blockquote handling
        if (node.name === "blockquote") {
          return [
            <View
              key={`blockquote-${nodeKey}`}
              style={[
                styles.blockquote,
                { borderColor: theme.colors["colors-border-border-primary"] }
              ]}
            >
              {node.children?.flatMap((child, i) =>
                renderNode(child, i, {}, nodeKey)
              )}
            </View>
          ];
        }

        // Paragraph handling
        if (node.name === "p") {
          return [
            <View
              key={`p-${nodeKey}`}
              style={[
                styles.paragraph,
                {
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "flex-start"
                }
              ]}
            >
              {node.children?.flatMap((child, i) =>
                renderNode(child, i, {}, nodeKey)
              )}
            </View>
          ];
        }

        // Unordered list handling
        if (node.name === "ul") {
          return [
            <View key={`ul-${nodeKey}`} style={styles.list}>
              {node.children
                ?.filter((child) => child.type === "tag" && child.name === "li")
                .map((child, i) => renderNode(child, i, {}, `${nodeKey}-ul`))}
            </View>
          ];
        }

        // Ordered list handling
        if (node.name === "ol") {
          return [
            <View key={`ol-${nodeKey}`} style={styles.list}>
              {node.children
                ?.filter((child) => child.type === "tag" && child.name === "li")
                .map((child, i) => (
                  <View key={`li-${nodeKey}-${i}`} style={styles.listItem}>
                    <Text
                      size={fontSize.md}
                      weight="regular"
                      style={styles.bullet}
                      color="color-colors-text-text-primary"
                    >
                      {i + 1}.
                    </Text>
                    <View style={styles.listItemContent}>
                      {child.children?.flatMap((grandchild, j) =>
                        renderNode(grandchild, j, {}, `${nodeKey}-${i}`)
                      )}
                    </View>
                  </View>
                ))}
            </View>
          ];
        }

        // List item handling
        if (node.name === "li") {
          return [
            <View key={`li-${nodeKey}`} style={styles.listItem}>
              <Text
                size={fontSize.md}
                weight="regular"
                style={styles.bullet}
                color="color-colors-text-text-primary"
              >
                •
              </Text>
              <View style={styles.listItemContent}>
                {node.children?.flatMap((child, i) =>
                  renderNode(child, i, {}, nodeKey)
                )}
              </View>
            </View>
          ];
        }

        // Line break
        if (node.name === "br") {
          return [<View key={`br-${nodeKey}`} style={styles.lineBreak} />];
        }

        // Render nested children with updated styles
        return (
          node.children?.flatMap((child, i) =>
            renderNode(child, i, currentStyles, nodeKey)
          ) || []
        );
      }

      return [];
    };

    // Render styled text with dynamic formatting
    const renderStyledText = (
      text: string,
      key: string,
      styleProps: TextStyleProps
    ) => {
      const textStyles = [
        styleProps.isItalic && styles.italic,
        styleProps.isStrikethrough && styles.strikethrough,
        styleProps.isLink && styles.link
      ].filter(Boolean);

      return [
        <Text
          key={key}
          size={fontSize.md}
          weight={styleProps.isBold ? "semiBold" : "regular"}
          style={textStyles}
          lineHeight={fontSize["2xl"]}
          align="left"
          color={styleProps.isLink ? "activeBlue" : "color-colors-text-text-primary"}
        >
          {text}
        </Text>
      ];
    };

    // Try parsing and rendering HTML content
    try {
      const nodes = parseHtml(html);
      return nodes.flatMap((node, index) =>
        renderNode(node, index, {}, "root")
      );
    } catch (error) {
      console.error("Error parsing HTML:", error);
      return [
        <Text key="error-root" color="color-colors-text-text-primary">
          {html}
        </Text>
      ];
    }
  }, [html, message, theme, handleUserMentionPress, handleLinkPress]);

  if (!html) return null;

  return (
    <View style={[styles.container, containerStyle]}>{parsedContent}</View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: "flex-start",
    width: "100%"
  },
  paragraph: {
    marginBottom: padding.xxs,
    textAlign: "left"
  },
  italic: {
    fontStyle: "italic"
  },
  strikethrough: {
    textDecorationLine: "line-through"
  },
  blockquote: {
    borderLeftWidth: 2,
    paddingLeft: padding.lg,
    marginVertical: padding.lg
  },
  mention: {
    borderWidth: 0.5,
    borderRadius: borderRadius.sm,
    paddingHorizontal: padding.sm
  },
  link: {
    textDecorationLine: "underline",
    textAlign: "left",
    color: "#0033AA"
  },
  lineBreak: {
    height: padding.sm,
    width: "100%"
  },
  list: {
    marginVertical: padding.xs,
    paddingLeft: padding.md,
    alignItems: "center"
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: padding.xxs
  },
  bullet: {
    marginRight: padding.xs,
    marginTop: 2,
    minWidth: 20
  },
  listItemContent: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start"
  }
});
