import { useRef, useEffect } from "react";
import { useSelector } from "react-redux";
import { State } from "store/types.ts";
import { preloadImageUris } from "shared/components/CachedImage.tsx";

/**
 * Keeps the top-bar avatar URL stable when `user.avatarPath` is briefly empty during
 * rehydration or merges, so tab screens match Home behavior and FastImage does not churn.
 */
export function useStableTopBarAvatar() {
  const user = useSelector((state: State) => state.userReducer.user);
  const lastAvatarPathRef = useRef<string | undefined>(undefined);
  const trimmed = user?.avatarPath?.trim();
  if (trimmed) lastAvatarPathRef.current = trimmed;
  const avatarSource = trimmed || lastAvatarPathRef.current;
  const avatarName =
    user?.email?.trim() ||
    user?.extName?.trim() ||
    user?.peerName?.trim() ||
    "?";

  useEffect(() => {
    const u = user?.avatarPath?.trim();
    if (u) preloadImageUris([u]);
  }, [user?.avatarPath]);

  return { avatarSource, avatarName };
}
