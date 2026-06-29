// React Imports
import Sound from "react-native-sound";
import { useTheme } from "hooks/use-theme.ts";
import { useEffect, useState, useRef } from "react";
import ReactNativeBlobUtil from "react-native-blob-util";
import { ActivityIndicator, Platform, StyleSheet } from "react-native";

// Type Imports
import React from "react";

// Component Imports
import Icon from "shared/components/Icon.tsx";
import { Logger } from "shared/utils/Logger.ts";
import { Text } from "shared/components/Text.tsx";
import { TouchableOpacity, View } from "react-native";
import Slider from "@react-native-community/slider";

type AudioPlaybackProps = {
  url: string | null;
  onComplete?: () => void;
  onError?: (error: any) => void;
  onPlayStart?: () => void;
};

export const AudioPlayback = ({
  url,
  onComplete,
  onError,
  onPlayStart
}: AudioPlaybackProps) => {
  // Constants
  const logger = new Logger("AudioPlayback: ");

  // Hooks
  const theme = useTheme();

  // Local State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Refs
  const soundRef = useRef<Sound | null>(null);
  const progressTimer = useRef<NodeJS.Timeout | null>(null);
  const previousUrl = useRef<string | null>(null);

  // Methods
  const stopProgressTimer = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  };

  const startProgressTimer = () => {
    stopProgressTimer();
    progressTimer.current = setInterval(() => {
      if (!soundRef.current) return;

      soundRef.current.getCurrentTime((seconds) => {
        if (duration > 0) {
          setProgress(Math.min(seconds / duration, 1));
          setCurrentTime(seconds);
        }
      });
    }, 250);
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? "0" + sec : sec}`;
  };

  const loadAudio = async (mediaUrl: string) => {
    try {
      setIsLoading(true);
      const response = await ReactNativeBlobUtil.config({
        fileCache: true
      }).fetch("GET", mediaUrl);
      const path = response.path();

      return new Promise<Sound>((resolve, reject) => {
        const sound = new Sound(path, "", (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(sound);
        });
      });
    } catch (error) {
      logger.error("Error loading audio:", error);
      throw error;
    }
  };

  const handlePlay = async () => {
    try {
      if (!url) return;

      if (soundRef.current && previousUrl.current === url) {
        soundRef.current.play((success) => {
          if (success) {
            setIsPlaying(false);
            stopProgressTimer();
            // Ensure slider goes to end when playback completes.
            setProgress(1);
            setCurrentTime(duration);
            onComplete?.();
          }
        });
        setIsPlaying(true);
        startProgressTimer();
        return;
      }

      setIsLoading(true);
      onPlayStart?.();

      const sound = await loadAudio(url);
      const soundDuration = sound.getDuration();

      if (soundDuration <= 0) {
        throw new Error("Invalid sound duration");
      }

      sound.setVolume(1.0);
      soundRef.current = sound;
      previousUrl.current = url;
      setDuration(soundDuration);

      // Start playing and ensure the timer starts immediately
      setIsPlaying(true);
      sound.play((success) => {
        if (success) {
          setIsPlaying(false);
          stopProgressTimer();
          // Ensure slider goes to end when playback completes.
          setProgress(1);
          setCurrentTime(soundDuration);
          onComplete?.();
        }
      });

      progressTimer.current = setInterval(() => {
        // Force an immediate time update before starting the timer
        sound.getCurrentTime((seconds) => {
          setProgress(Math.min(seconds / soundDuration, 1));
          setCurrentTime(seconds);
        });
      }, 50);
    } catch (error) {
      onError?.(error);
      logger.error("Error playing audio:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = () => {
    if (!soundRef.current) return;

    soundRef.current.pause();
    stopProgressTimer();
    setIsPlaying(false);
  };

  const handleSeek = (value: number) => {
    if (!soundRef.current) return;

    const newPosition = value * duration;
    soundRef.current.setCurrentTime(newPosition);
    setProgress(value);
    setCurrentTime(newPosition);
  };

  useEffect(() => {
    if (Platform.OS === "ios") {
      Sound.setCategory("Playback", true);
      Sound.setActive(true);
    }

    return () => {
      if (Platform.OS === "ios") {
        Sound.setActive(false);
      }
      if (soundRef.current) {
        soundRef.current.release();
      }
      stopProgressTimer();
    };
  }, []);

  useEffect(() => {
    if (url !== previousUrl.current) {
      setProgress(0);
      setCurrentTime(0);
      setDuration(0);
      setIsPlaying(false);
      if (soundRef.current) {
        soundRef.current.release();
        soundRef.current = null;
      }
      stopProgressTimer();
    }
  }, [url]);

  // Preload audio to get duration before user hits play.
  useEffect(() => {
    if (!url) return;

    const preloadForDuration = async () => {
      try {
        const response = await ReactNativeBlobUtil.config({
          fileCache: true
        }).fetch("GET", url);
        const path = response.path();

        const sound = new Sound(path, "", (error) => {
          if (error) {
            logger.error("Error preloading audio for duration:", error);
            return;
          }
          const preloadedDuration = sound.getDuration();
          if (preloadedDuration > 0) {
            setDuration(preloadedDuration);
          }
          // Store preloaded sound so we don't need to load again.
          soundRef.current = sound;
          previousUrl.current = url;
        });
      } catch (error) {
        logger.error("Error fetching audio for duration:", error);
      }
    };

    preloadForDuration();
  }, [url]);

  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <TouchableOpacity
          disabled={isLoading}
          onPress={isPlaying ? handlePause : handlePlay}
          style={[styles.playButton, { opacity: isLoading ? 0.5 : 1 }]}
        >
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color={theme.colors["color-colors-text-text-primary"]}
            />
          ) : (
            <Icon
              name={isPlaying ? "pause-circle" : "play"}
              type="outline"
              size={22}
              stroke={theme.colors["color-colors-text-text-primary"]}
            />
          )}
        </TouchableOpacity>

        <Slider
          style={styles.slider}
          value={progress}
          onValueChange={handleSeek}
          minimumValue={0}
          maximumValue={1}
          minimumTrackTintColor={
            theme.colors["color-colors-foreground-fg-secondary"]
          }
          maximumTrackTintColor="#C2C2C4"
        />
      </View>

      <View style={styles.timeDisplay}>
        <Text>{formatTime(currentTime)}</Text>
        <Text>{formatTime(duration)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16
  },
  controls: {
    flexDirection: "row",
    alignItems: "center"
  },
  playButton: {
    padding: 8
  },
  slider: {
    flex: 1,
    height: 40,
    marginLeft: 5
  },
  timeDisplay: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8
  }
});
