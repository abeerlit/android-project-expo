/* eslint-disable react/prop-types */
// React Imports
import React, {
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect
} from "react";
import {
  View,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SectionList,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  LayoutChangeEvent
} from "react-native";

// Hook Imports
import { useTheme } from "hooks/use-theme.ts";
import { useDrawer } from "core/drawer/DrawerContext.tsx";

// Component Imports
import { Text } from "shared/components/Text.tsx";
import { WhiteSpace } from "shared/components/utils/Whitespace.tsx";
import SearchBar from "shared/components/utils/SearchBar.tsx";

// Utils & Constants
import { fontSize, padding, borderRadius } from "core/theme/theme.ts";
import {
  getEmojiData,
  getCategoryDisplayName,
  EmojiData,
  searchEmojis
} from "shared/utils/emojiData.ts";

// Types
interface AddReactionDrawerProps {
  onEmojiSelect?: (emoji: string) => void;
}

interface EmojiRow {
  id: string;
  emojis: EmojiData[];
}

interface SectionData {
  title: string;
  categoryId: string;
  data: EmojiRow[];
}

// Constants
const SCREEN_WIDTH = Dimensions.get("window").width;
const EMOJIS_PER_ROW = 9;
const EMOJI_BUTTON_WIDTH = (SCREEN_WIDTH - 60) / EMOJIS_PER_ROW;
const EMOJI_SIZE = 28;
const SEARCH_DEBOUNCE_MS = 200;
const SCROLL_RETRY_DELAY_MS = 500;
const SCROLL_TOLERANCE = 50;
const SECTION_LIST_CONFIG = {
  showsVerticalScrollIndicator: false,
  keyboardDismissMode: "on-drag" as const,
  removeClippedSubviews: true,
  maxToRenderPerBatch: 25,
  windowSize: 10,
  initialNumToRender: 25,
  scrollEventThrottle: 16
};

// Utility Functions
const chunkEmojisIntoRows = (emojis: EmojiData[]): EmojiRow[] => {
  const rows: EmojiRow[] = [];
  for (let i = 0; i < emojis.length; i += EMOJIS_PER_ROW) {
    const chunk = emojis.slice(i, i + EMOJIS_PER_ROW);
    rows.push({
      id: `row-${Math.floor(i / EMOJIS_PER_ROW)}`,
      emojis: chunk
    });
  }
  return rows;
};

// Custom Hooks
const useDebounced = (value: string, delay: number): string => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const useEmojiCategories = () => {
  return useMemo(() => {
    const emojiData = getEmojiData();
    return {
      categories: emojiData,
      sectionData: emojiData.map(
        (category): SectionData => ({
          title: getCategoryDisplayName(category.id),
          categoryId: category.id,
          data: chunkEmojisIntoRows(category.emojis)
        })
      )
    };
  }, []);
};

const useEmojiSearch = (searchQuery: string, isSearching: boolean) => {
  const debouncedQuery = useDebounced(searchQuery, SEARCH_DEBOUNCE_MS);

  return useMemo(() => {
    if (!isSearching || !debouncedQuery.trim()) return [];
    return searchEmojis(debouncedQuery, 100);
  }, [debouncedQuery, isSearching]);
};

const useCategoryNavigation = (
  categories: ReturnType<typeof getEmojiData>,
  sectionData: SectionData[]
) => {
  const sectionListRef = useRef<SectionList<EmojiRow, SectionData>>(null);
  const categoryTabsRef = useRef<ScrollView>(null);
  const categoryTabPositions = useRef<Record<string, number>>({});
  const categoryTabWidths = useRef<Record<string, number>>({});
  const isUserScrolling = useRef(false);

  const scrollToActiveTab = useCallback((categoryId: string) => {
    const tabPosition = categoryTabPositions.current[categoryId];
    const tabWidth = categoryTabWidths.current[categoryId];

    if (
      tabPosition !== undefined &&
      tabWidth !== undefined &&
      categoryTabsRef.current
    ) {
      const scrollToPosition = Math.max(0, tabPosition - SCROLL_TOLERANCE);
      categoryTabsRef.current.scrollTo({ x: scrollToPosition, animated: true });
    }
  }, []);

  const handleCategoryPress = useCallback(
    (categoryId: string) => {
      isUserScrolling.current = false;
      const sectionIndex = sectionData.findIndex(
        (section) => section.categoryId === categoryId
      );

      if (sectionIndex !== -1 && sectionListRef.current) {
        sectionListRef.current.scrollToLocation({
          sectionIndex,
          itemIndex: 0,
          animated: true,
          viewPosition: 0
        });
      }
    },
    [sectionData]
  );

  const handleCategoryTabLayout = useCallback(
    (categoryId: string, event: LayoutChangeEvent) => {
      const { x, width } = event.nativeEvent.layout;
      categoryTabPositions.current[categoryId] = x;
      categoryTabWidths.current[categoryId] = width;
    },
    []
  );

  const handleScroll = useCallback(
    (
      event: NativeSyntheticEvent<NativeScrollEvent>,
      selectedCategory: string,
      onCategoryChange: (categoryId: string) => void
    ) => {
      if (!isUserScrolling.current) return;

      const scrollY = event.nativeEvent.contentOffset.y;
      let currentCategory = categories[0]?.id || "";

      // Find which category section we're currently viewing
      for (let i = categories.length - 1; i >= 0; i--) {
        const categoryId = categories[i].id;
        const sectionIndex = sectionData.findIndex(
          (section) => section.categoryId === categoryId
        );

        if (sectionIndex !== -1) {
          // Estimate position based on section index (simplified calculation)
          const estimatedPosition = sectionIndex * 300; // Rough estimate
          if (scrollY >= estimatedPosition - SCROLL_TOLERANCE) {
            currentCategory = categoryId;
            break;
          }
        }
      }

      if (currentCategory !== selectedCategory) {
        onCategoryChange(currentCategory);
        scrollToActiveTab(currentCategory);
      }
    },
    [categories, sectionData, scrollToActiveTab]
  );

  const handleScrollToIndexFailed = useCallback(
    (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => {
      const wait = new Promise((resolve) =>
        setTimeout(resolve, SCROLL_RETRY_DELAY_MS)
      );
      wait.then(() => {
        sectionListRef.current?.scrollToLocation({
          sectionIndex: info.index,
          itemIndex: 0,
          animated: true,
          viewPosition: 0
        });
      });
    },
    []
  );

  return {
    sectionListRef,
    categoryTabsRef,
    isUserScrolling,
    handleCategoryPress,
    handleCategoryTabLayout,
    handleScroll,
    handleScrollToIndexFailed
  };
};

// Sub-Components
const CategoryTab = React.memo<{
  categoryId: string;
  isSelected: boolean;
  onPress: (categoryId: string) => void;
  onLayout: (categoryId: string, event: LayoutChangeEvent) => void;
}>(({ categoryId, isSelected, onPress, onLayout }) => {
  const theme = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.categoryTab,
        {
          backgroundColor: isSelected
            ? theme.colors["color-colors-background-bg-brand-primary-alt"]
            : "transparent",
          borderColor: isSelected
            ? theme.colors["color-colors-border-border-brand-solid"]
            : theme.colors["color-colors-border-border-secondary"]
        }
      ]}
      onPress={() => onPress(categoryId)}
      onLayout={(event) => onLayout(categoryId, event)}
    >
      <Text
        size={fontSize.md}
        weight={isSelected ? "semiBold" : "regular"}
        color={
          isSelected
            ? "color-colors-text-text-brand-secondary"
            : "colors-text-text-secondary"
        }
      >
        {getCategoryDisplayName(categoryId)}
      </Text>
    </TouchableOpacity>
  );
});
CategoryTab.displayName = "CategoryTab";

const EmojiRow = React.memo<{
  item: EmojiRow;
  onEmojiPress: (emoji: EmojiData) => void;
}>(({ item, onEmojiPress }) => (
  <View style={styles.emojiRow}>
    {item.emojis.map((emoji, index) => (
      <TouchableOpacity
        key={`${emoji.id}-${index}`}
        style={styles.emojiButton}
        onPress={() => onEmojiPress(emoji)}
        activeOpacity={0.7}
      >
        <Text size={EMOJI_SIZE} weight="regular">
          {emoji.emoji}
        </Text>
      </TouchableOpacity>
    ))}
    {/* Fill remaining spaces to maintain alignment */}
    {Array.from({ length: EMOJIS_PER_ROW - item.emojis.length }).map(
      (_, index) => (
        <View key={`spacer-${index}`} style={styles.emojiButton} />
      )
    )}
  </View>
));
EmojiRow.displayName = "EmojiRow";

const SectionHeader = React.memo<{ section: SectionData }>(({ section }) => {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.sectionHeaderContainer,
        {
          backgroundColor: theme.colors["color-colors-background-bg-secondary"]
        }
      ]}
    >
      <Text
        size={fontSize.lg}
        weight="semiBold"
        align="left"
        color="color-colors-text-text-primary"
        style={styles.sectionHeader}
      >
        {section.title}
      </Text>
    </View>
  );
});
SectionHeader.displayName = "SectionHeader";

const EmptySearchResults = React.memo<{
  searchQuery: string;
  debouncedQuery: string;
}>(({ searchQuery, debouncedQuery }) => (
  <View style={styles.noResultsContainer}>
    <Text
      size={fontSize.md}
      weight="regular"
      color="colors-text-text-secondary"
      style={styles.centeredText}
    >
      {debouncedQuery === searchQuery
        ? `No emojis found for "${searchQuery}"`
        : "Searching..."}
    </Text>
  </View>
));
EmptySearchResults.displayName = "EmptySearchResults";

// Main Component
export const AddReactionDrawer: React.FC<AddReactionDrawerProps> = ({
  onEmojiSelect
}) => {
  const { closeDrawer } = useDrawer();

  // State
  const [selectedCategory, setSelectedCategory] = useState<string>("people");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSearching, setIsSearching] = useState<boolean>(false);

  // Custom hooks
  const { categories, sectionData } = useEmojiCategories();
  const searchResults = useEmojiSearch(searchQuery, isSearching);
  const debouncedSearchQuery = useDebounced(searchQuery, SEARCH_DEBOUNCE_MS);

  const {
    sectionListRef,
    categoryTabsRef,
    isUserScrolling,
    handleCategoryPress,
    handleCategoryTabLayout,
    handleScroll,
    handleScrollToIndexFailed
  } = useCategoryNavigation(categories, sectionData);

  // Memoized data
  const searchSectionData = useMemo((): SectionData[] => {
    if (!searchResults.length) return [];
    return [
      {
        title: "Results",
        categoryId: "search",
        data: chunkEmojisIntoRows(searchResults)
      }
    ];
  }, [searchResults]);

  // Handlers
  const handleEmojiPress = useCallback(
    (emoji: EmojiData) => {
      onEmojiSelect?.(emoji.emoji);
      closeDrawer();
    },
    [onEmojiSelect, closeDrawer]
  );

  const handleSearchTextChange = useCallback((text: string) => {
    setSearchQuery(text);
    setIsSearching(text.trim().length > 0);
  }, []);

  const handleSearchCancel = useCallback(() => {
    setSearchQuery("");
    setIsSearching(false);
  }, []);

  const handleSearchFocusChange = useCallback(
    (focused: boolean) => {
      if (!focused && !searchQuery.trim()) {
        setIsSearching(false);
      }
    },
    [searchQuery]
  );

  // Render methods
  const renderSectionItem = useCallback(
    ({ item }: { item: EmojiRow }) => (
      <EmojiRow item={item} onEmojiPress={handleEmojiPress} />
    ),
    [handleEmojiPress]
  );

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionData }) => (
      <SectionHeader section={section} />
    ),
    []
  );

  const keyExtractor = useCallback((item: EmojiRow) => item.id, []);

  const renderSearchResults = () => {
    if (!searchQuery.trim()) return null;

    return (
      <SectionList<EmojiRow, SectionData>
        sections={searchSectionData}
        renderItem={renderSectionItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyExtractor}
        key="search-grid"
        style={styles.emojiScrollView}
        ListEmptyComponent={() => (
          <EmptySearchResults
            searchQuery={searchQuery}
            debouncedQuery={debouncedSearchQuery}
          />
        )}
        {...SECTION_LIST_CONFIG}
      />
    );
  };

  const renderCategoryView = () => (
    <>
      <ScrollView
        ref={categoryTabsRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoryTabsContainer}
        contentContainerStyle={styles.categoryTabsContent}
      >
        {categories.map((category) => (
          <CategoryTab
            key={category.id}
            categoryId={category.id}
            isSelected={selectedCategory === category.id}
            onPress={handleCategoryPress}
            onLayout={handleCategoryTabLayout}
          />
        ))}
      </ScrollView>

      <WhiteSpace height={padding.xl} />

      <SectionList<EmojiRow, SectionData>
        ref={sectionListRef}
        sections={sectionData}
        renderItem={renderSectionItem}
        renderSectionHeader={renderSectionHeader}
        keyExtractor={keyExtractor}
        key="category-grid"
        style={styles.emojiScrollView}
        onScroll={(event) =>
          handleScroll(event, selectedCategory, setSelectedCategory)
        }
        onScrollBeginDrag={() => {
          isUserScrolling.current = true;
        }}
        onMomentumScrollEnd={() => {
          isUserScrolling.current = false;
        }}
        onScrollToIndexFailed={handleScrollToIndexFailed}
        {...SECTION_LIST_CONFIG}
      />
    </>
  );

  return (
    <View style={styles.container}>
      <SearchBar
        placeholder="Search emojis..."
        value={searchQuery}
        onChangeText={handleSearchTextChange}
        onCancel={handleSearchCancel}
        onFocusChange={handleSearchFocusChange}
        containerStyle={styles.searchBarContainer}
      />

      <WhiteSpace height={padding.md} />

      {isSearching ? renderSearchResults() : renderCategoryView()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    flex: 1
  },
  searchBarContainer: {
    marginTop: padding.sm
  },
  categoryTabsContainer: {
    maxHeight: 45
  },
  categoryTabsContent: {
    paddingVertical: padding.xs
  },
  categoryTab: {
    paddingHorizontal: padding.lg,
    paddingVertical: padding.md,
    borderRadius: borderRadius.md,
    marginRight: padding.md,
    borderWidth: 1
  },
  emojiScrollView: {
    flex: 1
  },
  sectionHeaderContainer: {
    width: "100%",
    paddingVertical: padding.lg,
    paddingBottom: padding.xl
  },
  sectionHeader: {
    width: "100%"
  },
  emojiRow: {
    flexDirection: "row",
    marginBottom: padding.xs,
    justifyContent: "flex-start"
  },
  emojiButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: borderRadius.sm,
    width: EMOJI_BUTTON_WIDTH,
    height: EMOJI_BUTTON_WIDTH,
    flex: 0
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: padding["3xl"]
  },
  centeredText: {
    textAlign: "center"
  }
});
