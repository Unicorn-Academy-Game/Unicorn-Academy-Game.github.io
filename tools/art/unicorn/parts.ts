/** Mesh part ids. Inner outlines appear where one part passes in front of another. */
export const PART = {
  body: 0,
  foreL: 1,
  foreR: 2,
  hindL: 3,
  hindR: 4,
  neck: 5,
  head: 6,
  earL: 7,
  earR: 8,
  horn: 9,
  halter: 10,
  earInnerL: 11,
  earInnerR: 12,
  accent: 13,
  jaw: 14,
  /** Mane locks occupy hairBase + index. */
  maneBase: 20,
  /** Tail locks occupy tailBase + index. */
  tailBase: 80,
  forelockBase: 140,
} as const;

export const COAT_PARTS: readonly number[] = [
  PART.body,
  PART.neck,
  PART.head,
  PART.foreL,
  PART.foreR,
  PART.hindL,
  PART.hindR,
  PART.jaw,
];
