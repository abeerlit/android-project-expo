import React, { ReactElement, useMemo, forwardRef } from "react";
import {
  FlatList as NativeFlatList,
  FlatListProps,
  RefreshControl
} from "react-native";
import { Loader } from "shared/components/utils/Loader.tsx";

interface Props<T> extends FlatListProps<T> {
  loading?: boolean;
  refreshing?: boolean;
  hideLoadingSpinner?: boolean;
  hideSkeletons?: boolean;
  skeletonRowsAmount?: number;
  skeletonRow?: ReactElement;
}

function FlatListInner<T>(
  {
    loading,
    hideLoadingSpinner = false,
    hideSkeletons,
    skeletonRowsAmount = 12,
    skeletonRow,
    ListEmptyComponent,
    ListHeaderComponent,
    refreshing,
    data,
    onRefresh,
    renderItem,
    keyExtractor,
    showsVerticalScrollIndicator = false,
    ...forwardProps
  }: Props<T>,
  ref: React.Ref<NativeFlatList<T>>
) {
  const skeletonMockItems = useMemo(
    () => new Array(skeletonRowsAmount).fill(""),
    [skeletonRowsAmount]
  );
  const showSkeletons = Boolean(
    !hideSkeletons && skeletonRow && !data?.length && loading
  );

  const {
    removeClippedSubviews = true,
    maxToRenderPerBatch = 10,
    windowSize = 10,
    initialNumToRender = 10,
    updateCellsBatchingPeriod = 50,
    ...restForwardProps
  } = forwardProps;

  return (
    <NativeFlatList<T>
      ref={ref}
      {...restForwardProps}
      removeClippedSubviews={removeClippedSubviews}
      maxToRenderPerBatch={maxToRenderPerBatch}
      windowSize={windowSize}
      initialNumToRender={initialNumToRender}
      updateCellsBatchingPeriod={updateCellsBatchingPeriod}
      data={showSkeletons ? skeletonMockItems : data}
      ListEmptyComponent={
        loading && !hideLoadingSpinner ? <Loader /> : ListEmptyComponent
      }
      ListFooterComponent={ListHeaderComponent}
      keyExtractor={showSkeletons ? (_item, index) => `${index}` : keyExtractor}
      renderItem={showSkeletons && skeletonRow ? () => skeletonRow : renderItem}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={Boolean(refreshing)}
            onRefresh={() => onRefresh()}
          />
        ) : undefined
      }
    />
  );
}

export const FlatList = forwardRef(FlatListInner) as <T>(
  props: Props<T> & { ref?: React.Ref<NativeFlatList<T>> }
) => React.ReactElement;
