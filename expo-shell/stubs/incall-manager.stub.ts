/** No-op InCallManager when native module is not in the dev client binary. */
const InCallManager = {
  start: () => {},
  stop: () => {},
  setForceSpeakerphoneOn: () => {},
  setSpeakerphoneOn: () => {},
  setMicrophoneMute: () => {},
  startRingback: () => {},
  stopRingback: () => {},
  startRingtone: () => {},
  stopRingtone: () => {},
  startBusytone: () => {},
  stopBusytone: () => {}
};

export default InCallManager;
