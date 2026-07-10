/**
 * Hook that provides a type-safe way to access the params in a route
 */
import { Route, useRoute } from "@react-navigation/core";

export function useParams<T extends object>(): T {
  const { params } = useRoute<Route<string, T>>();
  return params || ({} as T);
}
