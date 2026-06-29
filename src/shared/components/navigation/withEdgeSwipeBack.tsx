import React from "react";
import { StyleSheet, View } from "react-native";
import { EdgeSwipeBackZone } from "./EdgeSwipeBackZone.tsx";

type AnyProps = Record<string, any>;

/**
 * Full-screen Android edge swipe-back overlay (screen content below; narrow gesture strip).
 */
export function withEdgeSwipeBack<P extends AnyProps>(
  ScreenComponent: React.ComponentType<P>
) {
  const Wrapped: React.FC<P> = (props) => (
    <View style={styles.container}>
      <ScreenComponent {...(props as P)} />
      <EdgeSwipeBackZone edges="screen" style={styles.edgeLayer} />
    </View>
  );

  Wrapped.displayName = `withEdgeSwipeBack(${
    ScreenComponent.displayName || ScreenComponent.name || "Screen"
  })`;

  return Wrapped;
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  /** Absolute layer over the screen; does not affect flex layout of children. */
  edgeLayer: {
    ...StyleSheet.absoluteFillObject,
    flex: undefined,
    zIndex: 1
  }
});
