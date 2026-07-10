export type Theme = {
  dark: boolean;
  colors: {
    transparent: string;
    primary: string;
    backgroundColor: string;
    shadow: string;
    buttonBackground: string;
    blue: string;
    textButton: string;
    secondary: string;
    action: string;
    danger: string;
    success: string;
    white: string;
    bg: string;
    disabled: string;
    grey: string;
    lightGrey: string;
    borderColor: string;
    dropDownText: string;
    title: string;
    switchOffColor: string;
    switchOnColor: string;
    activeBlue: string;
    activeBackgroundBlue: string;
    placeholderColor: string;
    backgroundSvg: string;
    backgroundSvgHighOpacity: string;
    black: string;
    "color-component-colors-components-buttons-primary-button-primary-bg": string;
    "color-component-colors-components-buttons-primary-button-primary-border": string;
    "color-component-colors-components-buttons-primary-button-primary-fg": string;
    "colors-border-border-primary": string;
    "colors-text-text-placeholder": string;
    "colors-text-text-secondary": string;
    "colors-background-bg-brand-solid": string;
    "colors-text-text-primary-on-brand": string;
    "colors-border-border-error": string;
    "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg": string;
    "color-component-colors-components-buttons-tertiary-button-tertiary-fg": string;
    "color-colors-border-border-disabled-subtle": string;
    "color-colors-foreground-fg-disabled": string;
    "color-colors-background-bg-disabled": string;
    "color-colors-background-bg-primary": string;
    "color-colors-border-border-secondary": string;
    "color-colors-text-text-primary": string;
    "color-colors-border-border-brand-solid": string;
    "color-colors-text-text-tertiary": string;
    "colors-background-bg-secondary": string;
    "colors-text-text-brand-primary": string;
    "color-colors-text-text-brand-secondary": string;
    "color-colors-background-bg-primary-alt": string;
    "color-colors-background-bg-brand-primary-alt": string;
    "color-colors-text-text-quarterary": string;
    "color-colors-foreground-fg-error-primary": string;
    "color-colors-background-bg-primary-hover": string;
    "color-colors-background-bg-secondary": string;
    "color-colors-foreground-fg-secondary": string;
    "color-component-colors-utility-brand-utility-brand-700": string;
    "color-component-colors-utility-brand-utility-brand-200": string;
    "color-component-colors-utility-brand-utility-brand-50": string;
    "colors-background-bg-warning-secondary": string;
    "component-colors-components-icons-featured-icons-light-featured-icon-light-fg-warning": string;
    "colors-background-bg-error-secondary": string;
    "colors-components-icons-featured-icons-light-featured-icon-light-fg-error": string;
    "colors-foreground-fg-tertiary": string;
    "colors-foreground-fg-warning-secondary": string;
    "component-colors-utility-brand-utility-brand-400": string;
    "component-colors-components-avatars-avatar-contrast-border": string;
    "component-colors-components-avatars-avatar-bg": string;
    "color-colors-foreground-fg-quarterary": string;
    "color-component-colors-components-avatars-avatar-profile-photo-border": string;
    "colors-background-bg-tertiary": string;
    "colors-background-bg-brand-secondary": string;
    "colors-background-bg-success-secondary": string;
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-gray": string;
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-brand": string;
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success": string;
    "color-colors-text-text-secondary": string;
    "component-colors-components-buttons-primary-error-button-primary-error-bg": string;
    "component-colors-components-buttons-primary-error-button-primary-error-border": string;
    "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg": string;
    "colors-foreground-fg-white": string;
    "component-colors-components-application-navigation-nav-item-button-icon-fg": string;
    "component-colors-components-buttons-secondary-button-secondary-fg": string;
  };
  gradients: Record<string, string>;
  fonts: {
    normal: string;
    regular: string;
    medium: string;
    semiBold: string;
    bold: string;
  };
  animation: {
    scale: number;
  };
};

export const lightTheme: Theme = {
  dark: false,
  colors: {
    transparent: "#00000000",
    primary: "rgb(3,23,31)",
    backgroundColor: "#ffffff",
    shadow: "#00000050",
    buttonBackground: "#000000",
    blue: "#1586EF",
    textButton: "#ffffff",
    secondary: "#F92120",
    action: "rgb(3,23,31)",
    danger: "#f54d43",
    success: "#19b269",
    white: "#ffffff",
    bg: "#ffffff",
    disabled: "#bcc7d3",
    grey: "grey",
    lightGrey: "#5C696F",
    borderColor: "#C0C4C5",
    dropDownText: "#536068",
    title: "#2E3F48",
    switchOffColor: "#788287",
    switchOnColor: "#1782FF",
    activeBlue: "#004EEB",
    activeBackgroundBlue: "#EFF4FF",
    placeholderColor: "#D4D5D6",
    backgroundSvg: "#00000010",
    backgroundSvgHighOpacity: "#00000060",
    black: "black",
    "colors-text-text-primary-on-brand": "#ffffff",
    "colors-border-border-primary": "#D1D1D6",
    "colors-text-text-placeholder": "#70707B",
    "colors-text-text-secondary": "#3F3F46",
    "colors-background-bg-brand-solid": "#26272b",
    "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg":
      "#004EEB",
    "color-colors-foreground-fg-disabled": "#A0A0AB",
    "color-colors-border-border-disabled-subtle": "#E4E4E7",
    "color-colors-background-bg-disabled": "#E4E4E7",
    "color-component-colors-components-buttons-primary-button-primary-bg":
      "#1A1A1E",
    "color-component-colors-components-buttons-primary-button-primary-border":
      "#1A1A1E",
    "component-colors-utility-brand-utility-brand-400": "#528BFF",
    "color-component-colors-components-buttons-primary-button-primary-fg":
      "#FFFFFF",
    "color-colors-background-bg-primary": "#FFFFFF",
    "color-colors-border-border-secondary": "#E4E4E7",
    "color-colors-text-text-primary": "#1A1A1E",
    "colors-border-border-error": "#F04438",
    "color-colors-border-border-brand-solid": "#26272B",
    "color-colors-text-text-tertiary": "#51525C",
    "colors-background-bg-secondary": "#FAFAFA",
    "colors-text-text-brand-primary": "#00359E",
    "color-colors-text-text-brand-secondary": "#004EEB",
    "color-colors-background-bg-primary-alt": "#FFFFFF",
    "color-colors-background-bg-brand-primary-alt": "#EFF4FF",
    "color-colors-text-text-quarterary": "#70707B",
    "color-colors-foreground-fg-error-primary": "#D92D20",
    "color-colors-background-bg-primary-hover": "#FAFAFA",
    "color-colors-background-bg-secondary": "#FAFAFA",
    "color-component-colors-components-buttons-tertiary-button-tertiary-fg":
      "#51525C",
    "colors-background-bg-warning-secondary": "#FEF0C7",
    "component-colors-components-icons-featured-icons-light-featured-icon-light-fg-warning":
      "#DC6803",
    "colors-background-bg-error-secondary": "#FEE4E2",
    "colors-components-icons-featured-icons-light-featured-icon-light-fg-error":
      "#D92D20",
    "color-colors-foreground-fg-secondary": "#3F3F46",
    "color-component-colors-utility-brand-utility-brand-700": "#004EEB",
    "color-component-colors-utility-brand-utility-brand-200": "#B2CCFF",
    "color-component-colors-utility-brand-utility-brand-50": "#EFF4FF",
    "colors-foreground-fg-tertiary": "#51525C",
    "colors-foreground-fg-warning-secondary": "#F79009",
    "component-colors-components-application-navigation-nav-item-button-icon-fg":
      "#70707b",
    "component-colors-components-avatars-avatar-contrast-border": "#00000014",
    "component-colors-components-avatars-avatar-bg": "#F4F4F5",
    "color-colors-foreground-fg-quarterary": "#70707B",
    "color-component-colors-components-avatars-avatar-profile-photo-border":
      "#FFFFFF",
    "colors-background-bg-tertiary": "#F4F4F5",
    "colors-background-bg-brand-secondary": "#D1E0FF",
    "colors-background-bg-success-secondary": "#DCFAE6",
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-gray":
      "#70707B",
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-brand":
      "#155EEF",
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success":
      "#079455",
    "color-colors-text-text-secondary": "#3F3F46",
    "component-colors-components-buttons-primary-error-button-primary-error-bg":
      "#D92D20",
    "component-colors-components-buttons-primary-error-button-primary-error-border":
      "#D92D20",
    "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg":
      "#B42318",
    "colors-foreground-fg-white": "#FFFFFF",
    "component-colors-components-buttons-secondary-button-secondary-fg":
      "#D1D1D6"
  },
  gradients: {},
  fonts: {
    normal: "200",
    regular: "300",
    medium: "400",
    semiBold: "600",
    bold: "700"
  },
  animation: {
    scale: 1.0
  }
};

export const darkTheme: Theme = {
  dark: true,
  colors: {
    transparent: "#00000000",
    primary: "rgb(255,255,255)",
    backgroundColor: "#000000",
    shadow: "#ffffff50",
    buttonBackground: "#ffffff",
    blue: "#1586EF",
    textButton: "#000000",
    secondary: "#F92120",
    action: "rgb(3,23,31)",
    danger: "#f54d43",
    success: "#19b269",
    white: "#ffffff",
    bg: "#ffffff",
    disabled: "#bcc7d3",
    grey: "grey",
    lightGrey: "#5C696F",
    borderColor: "#C0C4C5",
    dropDownText: "#536068",
    title: "#2E3F48",
    switchOffColor: "#788287",
    switchOnColor: "#1782FF",
    activeBlue: "#004EEB",
    activeBackgroundBlue: "#94aff3",
    placeholderColor: "#D4D5D6",
    backgroundSvg: "#ffffff10",
    backgroundSvgHighOpacity: "#ffffff60",
    black: "black",
    "colors-text-text-primary-on-brand": "#fafafa",
    "colors-border-border-primary": "#3F3F46",
    "colors-text-text-placeholder": "#70707B",
    "colors-text-text-secondary": "#D1D1D6",
    "colors-background-bg-brand-solid": "#3f3f46",
    "color-component-colors-components-buttons-tertiary-color-button-tertiary-color-fg":
      "#004EEB",
    "color-colors-foreground-fg-disabled": "#70707B",
    "color-colors-border-border-disabled-subtle": "#26272B",
    "color-colors-background-bg-disabled": "#26272B",
    "color-component-colors-components-buttons-primary-button-primary-bg":
      "#F4F4F5",
    "color-component-colors-components-buttons-primary-button-primary-border":
      "#F4F4F5",
    "color-component-colors-components-buttons-primary-button-primary-fg":
      "#1A1A1E",
    "color-colors-background-bg-primary": "#131316",
    "color-colors-border-border-secondary": "#26272B",
    "color-colors-text-text-primary": "#FAFAFA",
    "color-colors-border-border-brand-solid": "#3F3F46",
    "colors-border-border-error": "#F04438",
    "color-colors-text-text-tertiary": "#A0A0AB",
    "colors-background-bg-secondary": "#1A1A1E",
    "colors-text-text-brand-primary": "#FAFAFA",
    "color-colors-text-text-brand-secondary": "#D1D1D6",
    "color-colors-background-bg-primary-alt": "#1A1A1E",
    "color-colors-background-bg-brand-primary-alt": "#1A1A1E",
    "color-colors-text-text-quarterary": "#A0A0AB",
    "color-colors-foreground-fg-error-primary": "#F04438",
    "color-colors-background-bg-primary-hover": "#26272B",
    "color-colors-background-bg-secondary": "#1A1A1E",
    "color-component-colors-components-buttons-tertiary-button-tertiary-fg":
      "#A0A0AB",
    "color-colors-foreground-fg-secondary": "#D1D1D6",
    "color-component-colors-utility-brand-utility-brand-700": "#84ADFF",
    "color-component-colors-utility-brand-utility-brand-200": "#0040C1",
    "color-component-colors-utility-brand-utility-brand-50": "#002266",
    "colors-foreground-fg-tertiary": "#A0A0AB",
    "colors-foreground-fg-warning-secondary": "#FDB022",
    "component-colors-components-avatars-avatar-contrast-border": "#ffffff1f",
    "component-colors-components-avatars-avatar-bg": "#ffffff1f",
    "color-colors-foreground-fg-quarterary": "#A0A0AB",
    "color-component-colors-components-avatars-avatar-profile-photo-border":
      "#131316",
    "colors-background-bg-warning-secondary": "#DC6803",
    "component-colors-components-icons-featured-icons-light-featured-icon-light-fg-warning":
      "#FEDF89",
    "colors-background-bg-error-secondary": "#D92D20",
    "colors-components-icons-featured-icons-light-featured-icon-light-fg-error":
      "#FECDCA",
    "colors-background-bg-tertiary": "#26272B",
    "colors-background-bg-brand-secondary": "#155EEF",
    "colors-background-bg-success-secondary": "#079455",
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-gray":
      "#E4E4E7",
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-brand":
      "#B2CCFF",
    "color-component-colors-components-icons-featured-icons-light-featured-icon-light-fg-success":
      "#ABEFC6",
    "color-colors-text-text-secondary": "#D1D1D6",
    "component-colors-components-buttons-primary-error-button-primary-error-bg":
      "#D92D20",
    "component-colors-components-buttons-primary-error-button-primary-error-border":
      "#D92D20",
    "component-colors-components-buttons-tertiary-error-button-tertiary-error-fg":
      "#FDA29B",
    "colors-foreground-fg-white": "#FFFFFF",
    "component-colors-utility-brand-utility-brand-400": "#155EEF",
    "component-colors-components-application-navigation-nav-item-button-icon-fg":
      "#70707b",
    "component-colors-components-buttons-secondary-button-secondary-fg":
      "#3F3F46"
  },
  gradients: {},

  fonts: {
    normal: "200",
    regular: "300",
    medium: "400",
    semiBold: "600",
    bold: "700"
  },
  animation: {
    scale: 1.0
  }
};

export const padding = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 32,
  "5xl": 40,
  "6xl": 48,
  "7xl": 64,
  "8xl": 80,
  "9xl": 96,
  "10xl": 128,
  "11xl": 160
};

export const borderRadius = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  "2xl": 16,
  "3xl": 20,
  "4xl": 24,
  full: 9999
};

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24
};

export const componentSize = {
  xs: 24,
  sm: 16,
  md: 16,
  lg: 18,
  xl: 20,
  "2xl": 24
};
