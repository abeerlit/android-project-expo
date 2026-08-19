/**
 * No-op CallKeep when RNCallKeep native module is not in the dev client binary.
 */
const noop = () => {};
const noopAsync = async () => {};

const callkeepStub: Record<string, unknown> = new Proxy(
  {},
  {
    get(_target, prop) {
      if (prop === "then") return undefined;
      return noopAsync;
    }
  }
);

export default callkeepStub;
