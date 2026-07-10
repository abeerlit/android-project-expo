import data from "@emoji-mart/data";
import { EmojiMartData } from "@emoji-mart/data";

export interface EmojiData {
  id: string;
  emoji: string;
  name: string;
  category: string;
  keywords: string[];
}

export interface EmojiCategory {
  id: string;
  name: string;
  emojis: EmojiData[];
}

// Category configuration
const CATEGORY_CONFIG = {
  order: [
    "people",
    "nature",
    "foods",
    "activity",
    "places",
    "objects",
    "symbols",
    "flags"
  ],
  displayNames: {
    people: "People",
    "smileys-emotion": "Smileys",
    "animals-nature": "Nature",
    "food-drink": "Food",
    activities: "Activities",
    "travel-places": "Travel",
    objects: "Objects",
    symbols: "Symbols",
    flags: "Flags"
  } as Record<string, string>
} as const;

// Create category lookup map for O(1) access
const createCategoryLookup = (categories: any[]) => {
  const lookup = new Map<string, string>();
  categories.forEach((category) => {
    category.emojis.forEach((emojiId: string) => {
      lookup.set(emojiId, category.id);
    });
  });
  return lookup;
};

// Optimized processing function
const processEmojiData = (): EmojiCategory[] => {
  const emojiData = data as EmojiMartData;
  const categoryLookup = createCategoryLookup(emojiData.categories);
  const processedData = new Map<string, EmojiCategory>();

  // Process emojis in a single pass
  Object.entries(emojiData.emojis).forEach(([emojiId, emoji]) => {
    const nativeEmoji = emoji.skins?.[0]?.native;
    if (!nativeEmoji) return;

    const categoryId = categoryLookup.get(emojiId);
    if (!categoryId) return;

    // Get or create category
    let category = processedData.get(categoryId);
    if (!category) {
      category = {
        id: categoryId,
        name:
          CATEGORY_CONFIG.displayNames[categoryId] ||
          categoryId.charAt(0).toUpperCase() + categoryId.slice(1),
        emojis: []
      };
      processedData.set(categoryId, category);
    }

    // Add emoji to category
    category.emojis.push({
      id: emojiId,
      emoji: nativeEmoji,
      name: emoji.name || emojiId,
      category: categoryId,
      keywords: emoji.keywords || []
    });
  });

  // Sort categories by predefined order
  const sortedCategories: EmojiCategory[] = [];

  // Add categories in preferred order
  CATEGORY_CONFIG.order.forEach((categoryId) => {
    const category = processedData.get(categoryId);
    if (category) {
      sortedCategories.push(category);
      processedData.delete(categoryId); // Remove to avoid duplicates
    }
  });

  // Add remaining categories
  processedData.forEach((category) => sortedCategories.push(category));

  return sortedCategories;
};

// Singleton pattern with lazy initialization
class EmojiDataManager {
  private static instance: EmojiDataManager;
  private cachedData: EmojiCategory[] | null = null;

  private constructor() {}

  static getInstance(): EmojiDataManager {
    if (!EmojiDataManager.instance) {
      EmojiDataManager.instance = new EmojiDataManager();
    }
    return EmojiDataManager.instance;
  }

  getData(): EmojiCategory[] {
    if (!this.cachedData) {
      this.cachedData = processEmojiData();
    }
    return this.cachedData;
  }

  // Optional: method to clear cache if needed
  clearCache(): void {
    this.cachedData = null;
  }
}

// Public API
export const getEmojiData = (): EmojiCategory[] => {
  return EmojiDataManager.getInstance().getData();
};

export const getCategoryDisplayName = (categoryId: string): string => {
  return (
    CATEGORY_CONFIG.displayNames[categoryId] ||
    categoryId.charAt(0).toUpperCase() + categoryId.slice(1)
  );
};

// Optional: Helper to get specific category
export const getEmojiCategory = (
  categoryId: string
): EmojiCategory | undefined => {
  return getEmojiData().find((category) => category.id === categoryId);
};

// Optional: Helper to search emojis
export const searchEmojis = (query: string, limit = 50): EmojiData[] => {
  if (!query.trim()) return [];

  const lowerQuery = query.toLowerCase();
  const results: EmojiData[] = [];

  for (const category of getEmojiData()) {
    for (const emoji of category.emojis) {
      if (results.length >= limit) break;

      if (
        emoji.name.toLowerCase().includes(lowerQuery) ||
        emoji.keywords.some((keyword) =>
          keyword.toLowerCase().includes(lowerQuery)
        )
      ) {
        results.push(emoji);
      }
    }
    if (results.length >= limit) break;
  }

  return results;
};
