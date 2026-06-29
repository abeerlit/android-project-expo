// src/core/drawer/DrawerContext.tsx
import React, { createContext, useContext } from "react";

export type OpenDrawerOptions = {
  preventSwipeClose?: boolean;
  preventBackdropClose?: boolean;
  onHardwareBackPress?: () => void;
  backgroundColor?: string;
  borderColor?: string;
  handleColor?: string;
};

type DrawerContextType = {
  openDrawer: (
    content: React.ReactNode,
    snapPointIndex?: number,
    options?: OpenDrawerOptions
  ) => void;
  closeDrawer: () => void;
  setSnapPoint: (index: number) => void;
  isOpen: boolean;
  currentSnapPoint: number;
};

export const DrawerContext = createContext<DrawerContextType | undefined>(
  undefined
);

export const useDrawer = () => {
  const context = useContext(DrawerContext);
  if (!context) {
    throw new Error("useDrawer must be used within a DrawerProvider");
  }
  return context;
};
