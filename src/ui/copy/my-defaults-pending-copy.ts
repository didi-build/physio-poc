/** Empty until DIDI-1130 (Designer). Do not invent interim user-facing text. */

export type MyDefaultsPendingCopySlots = {
  shareLinkExpiryChangedToast: string | undefined;
  readoutOnceADay: string | undefined;
  readoutTwiceADay: string | undefined;
  readoutPerDayTimes: ((n: number) => string) | undefined;
  readoutPerDayRange: ((min: number, max: number) => string) | undefined;
  readoutOneSet: string | undefined;
  readoutNSets: ((n: number) => string) | undefined;
  readoutSecondsUp: ((n: number) => string) | undefined;
};

export const myDefaultsPendingCopySlots: MyDefaultsPendingCopySlots = {
  shareLinkExpiryChangedToast: undefined,
  readoutOnceADay: undefined,
  readoutTwiceADay: undefined,
  readoutPerDayTimes: undefined,
  readoutPerDayRange: undefined,
  readoutOneSet: undefined,
  readoutNSets: undefined,
  readoutSecondsUp: undefined,
};
