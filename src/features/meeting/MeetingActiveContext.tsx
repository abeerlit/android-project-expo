import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState
} from "react";
import type { DailyCall } from "@daily-co/react-native-daily-js";
import type { MeetingNavParams } from "features/meeting/meetingActiveParams.ts";
import type { TranscriptionLine } from "features/meeting/components/MeetingTranscriptionSheet.tsx";

type MeetingActiveContextValue = {
  /** Shared Daily call while joined or minimized. */
  callRef: React.MutableRefObject<DailyCall | null>;
  /** Route params used to re-open Meetings from the banner. */
  lastJoinedParamsRef: React.MutableRefObject<MeetingNavParams | null>;
  /** True after joined-meeting until intentional end or left-meeting. */
  meetingActiveGlobally: boolean;
  setMeetingActiveGlobally: (v: boolean) => void;
  /** Leave + destroy; clears refs and global active flag. */
  endMeetingGlobally: () => Promise<void>;
};

type MeetingTranscriptionLinesContextValue = {
  transcriptionLines: TranscriptionLine[];
  setTranscriptionLines: React.Dispatch<
    React.SetStateAction<TranscriptionLine[]>
  >;
};

const MeetingActiveContext = createContext<MeetingActiveContextValue | null>(
  null
);

const MeetingTranscriptionLinesContext =
  createContext<MeetingTranscriptionLinesContextValue | null>(null);

export function MeetingActiveProvider({ children }: { children: React.ReactNode }) {
  const callRef = useRef<DailyCall | null>(null);
  const lastJoinedParamsRef = useRef<MeetingNavParams | null>(null);
  const [meetingActiveGlobally, setMeetingActiveGlobally] = useState(false);
  const [transcriptionLines, setTranscriptionLines] = useState<
    TranscriptionLine[]
  >([]);

  const endMeetingGlobally = useCallback(async () => {
    setTranscriptionLines([]);
    const call = callRef.current;
    callRef.current = null;
    lastJoinedParamsRef.current = null;
    setMeetingActiveGlobally(false);
    if (!call || call.isDestroyed()) return;
    try {
      await call.leave();
    } catch {
      // ignore
    }
    try {
      await call.destroy();
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(
    () => ({
      callRef,
      lastJoinedParamsRef,
      meetingActiveGlobally,
      setMeetingActiveGlobally,
      endMeetingGlobally
    }),
    [meetingActiveGlobally, endMeetingGlobally]
  );

  const transcriptionLinesValue = useMemo(
    () => ({ transcriptionLines, setTranscriptionLines }),
    [transcriptionLines]
  );

  return (
    <MeetingActiveContext.Provider value={value}>
      <MeetingTranscriptionLinesContext.Provider value={transcriptionLinesValue}>
        {children}
      </MeetingTranscriptionLinesContext.Provider>
    </MeetingActiveContext.Provider>
  );
}

export function useMeetingActive(): MeetingActiveContextValue {
  const ctx = useContext(MeetingActiveContext);
  if (!ctx) {
    throw new Error("useMeetingActive must be used within a MeetingActiveProvider");
  }
  return ctx;
}

/** Persists final transcript lines for the active Daily call across Meetings screen unmount (minimize). */
export function useMeetingTranscriptionLines(): MeetingTranscriptionLinesContextValue {
  const ctx = useContext(MeetingTranscriptionLinesContext);
  if (!ctx) {
    throw new Error(
      "useMeetingTranscriptionLines must be used within a MeetingActiveProvider"
    );
  }
  return ctx;
}

