import { getAppLoggerName } from "shared/branding/appBrand.ts";

type LogFunction = (message: string, ...args: unknown[]) => void;

interface LoggerFunction extends LogFunction {
  log: LogFunction;
}

interface Debug {
  log: LogFunction;

  (message: string, ...args: unknown[]): void;
}

interface Warn {
  log: LogFunction;

  (message: string, ...args: unknown[]): void;
}

interface Error {
  log: LogFunction;

  (message: string, ...args: unknown[]): void;
}

export class Logger {
  debug: Debug;
  warn: Warn;
  error: Error;

  constructor(prefix: string) {
    const appName = getAppLoggerName();
    const name = prefix ? `${appName}:${prefix}` : appName;
    this.debug = this.createLogger(console.info, name) as Debug;
    this.warn = this.createLogger(console.warn, `${name}:WARN`) as Warn;
    this.error = this.createLogger(console.error, `${name}:ERROR`) as Error;
  }

  private createLogger(logFn: LogFunction, prefix: string): LogFunction {
    const logger: LoggerFunction = (
      message: string,
      ...args: unknown[]
    ): void => {
      logFn(`${prefix} ${message}`, ...args);
    };
    logger.log = logFn.bind(console);
    return logger;
  }
}
