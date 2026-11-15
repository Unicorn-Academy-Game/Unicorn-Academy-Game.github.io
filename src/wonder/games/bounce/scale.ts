/** How big the unicorns are drawn in the climb, in the flight and on the moon. */

/**
 * How much bigger they are drawn from the flight on, when she is the hero of the sky and then of
 * the moon.
 */
export const HERO = 1.2;

/**
 * How big the unicorns are drawn on the clouds, and on the moon: the one who leads, and the
 * friends.
 */
export const SCALE = { leader: 0.78, friend: 0.66, moonLeader: 0.78 * HERO, moonFriend: 0.66 * HERO } as const;
