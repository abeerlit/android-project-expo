/**
 * VoIP push is iOS-only; Android uses FCM + CallKeep instead.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
module.exports = require("../stubs/voip-push.stub.ts");
