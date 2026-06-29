// webrtc-polyfill.js
import "react-native-get-random-values";
import {
  MediaStreamTrack,
  RTCRtpSender,
  RTCRtpReceiver,
  RTCDataChannel,
  permissions,
  registerGlobals
} from "@daily-co/react-native-webrtc";

export function setupWebRTCPolyfill() {
  // Register standard globals first
  registerGlobals();

  // Create a basic Event polyfill for Hermes
  if (!global.Event) {
    global.Event = class Event {
      constructor(type, eventInitDict = {}) {
        this.type = type;
        this.bubbles = eventInitDict.bubbles || false;
        this.cancelable = eventInitDict.cancelable || false;
        this.composed = eventInitDict.composed || false;
        this.currentTarget = null;
        this.defaultPrevented = false;
        this.eventPhase = 0;
        this.target = null;
        this.timeStamp = Date.now();
        this.isTrusted = false;
      }

      preventDefault() {
        this.defaultPrevented = true;
      }

      stopPropagation() {
        // No-op for basic implementation
      }

      stopImmediatePropagation() {
        // No-op for basic implementation
      }
    };
  }

  // Now we can create the WebRTC event classes
  global.MediaStreamTrackEvent = class MediaStreamTrackEvent {
    constructor(type, eventInitDict = {}) {
      this.type = type;
      this.track = eventInitDict.track || null;
      this.bubbles = eventInitDict.bubbles || false;
      this.cancelable = eventInitDict.cancelable || false;
      this.currentTarget = null;
      this.defaultPrevented = false;
      this.eventPhase = 0;
      this.target = null;
      this.timeStamp = Date.now();
      this.isTrusted = false;
    }

    preventDefault() {
      this.defaultPrevented = true;
    }

    stopPropagation() {}

    stopImmediatePropagation() {}
  };

  global.RTCTrackEvent = class RTCTrackEvent {
    constructor(type, eventInitDict = {}) {
      this.type = type;
      this.track = eventInitDict.track || null;
      this.streams = eventInitDict.streams || [];
      this.receiver = eventInitDict.receiver || null;
      this.transceiver = eventInitDict.transceiver || null;
      this.bubbles = eventInitDict.bubbles || false;
      this.cancelable = eventInitDict.cancelable || false;
      this.currentTarget = null;
      this.defaultPrevented = false;
      this.eventPhase = 0;
      this.target = null;
      this.timeStamp = Date.now();
      this.isTrusted = false;
    }

    preventDefault() {
      this.defaultPrevented = true;
    }

    stopPropagation() {}

    stopImmediatePropagation() {}
  };

  global.RTCDataChannelEvent = class RTCDataChannelEvent {
    constructor(type, eventInitDict = {}) {
      this.type = type;
      this.channel = eventInitDict.channel || null;
      this.bubbles = eventInitDict.bubbles || false;
      this.cancelable = eventInitDict.cancelable || false;
      this.currentTarget = null;
      this.defaultPrevented = false;
      this.eventPhase = 0;
      this.target = null;
      this.timeStamp = Date.now();
      this.isTrusted = false;
    }

    preventDefault() {
      this.defaultPrevented = true;
    }

    stopPropagation() {}

    stopImmediatePropagation() {}
  };

  // Ensure all other globals are properly set
  global.MediaStreamTrack = MediaStreamTrack;
  global.RTCRtpSender = RTCRtpSender;
  global.RTCRtpReceiver = RTCRtpReceiver;
  global.RTCDataChannel = RTCDataChannel;

  // Add permissions API if needed
  if (!global.navigator.permissions) {
    global.navigator.permissions = permissions;
  }
}
