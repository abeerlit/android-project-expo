import { formatRelativeTime } from "shared/utils/utils.ts";
import { DateTime } from "luxon";

export const formatVMTime = (unixTime: number) => {
  const time = DateTime.fromSeconds(unixTime).toISO();
  return formatRelativeTime(time);
};
