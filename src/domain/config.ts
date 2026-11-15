import type { UnicornId } from '../shared/ids';

/** Every tuning value of the simulation, in one place. Units are world units and seconds. */
export const CONFIG = {
  /** Fixed simulation step. */
  stepHz: 30,
  step: 1 / 30,
  /**
   * Most steps taken for one rendered frame. Beyond this the simulation drops time rather than
   * catching up.
   */
  maxStepsPerFrame: 4,

  nav: {
    cell: 32,
    /** Radius of an actor's feet. Obstacles are inflated by this much. */
    footRadius: 22,
    /**
     * How much closer than `footRadius` to a wall a unicorn may stand. A place on the trail, cut
     * across a corner, can be that close.
     */
    standSlack: 3,
    /** New A* searches processed per simulation step. */
    pathBudget: 2,
    /** Distance between samples when checking a segment for clearance. */
    sampleStep: 8,
    /** How far the tap fallback may reach for a reachable point. Beyond this the tap is refused. */
    fallbackReach: 288,
    /** Largest corner cut when rounding a simplified path. */
    cornerRound: 28,
  },

  speed: {
    leader: 210,
    /** Steady walking speed of each companion, stable per character, between 205 and 225. */
    companion: { wildstar: 210, leaf: 207, glacier: 224, river: 205, cinder: 218, storm: 222 } satisfies Record<
      UnicornId,
      number
    >,
    catchUpMax: 285,
    /** Speed change per second, so catch-up eases in and out. */
    accel: 360,
    /** Arrival tolerance for ground taps. */
    arrive: 12,
  },

  /** Wildstar walking the way a finger or a key points, for as long as it is held. */
  steer: {
    /**
     * Tightest circle Wildstar runs on, in units. Her course turns at her speed over this, so a
     * finger that swings right round makes her sweep an arc and not spin on the spot, and the herd
     * behind can follow the trail.
     */
    turnRadius: 40,
    /**
     * Speed gained per second setting off and lost per second slowing or letting go. She stops in
     * about 15 units.
     */
    accel: 1500,
    brake: 1400,
    /** She pivots on the spot, not in a circle, while slower than this. */
    pivotBelow: 24,
    /**
     * Below this fraction of the ground she meant to cover, she is up against something and stops
     * instead of running on the spot.
     */
    blockedBelow: 0.2,
    /**
     * A step shorter than this, in units, is a nudge from the ground and not a direction she chose,
     * so it turns her only in proportion. Pressed against a tree she moves a fraction of a unit a
     * step, in whatever direction the tree allows, and does not look about.
     */
    lookFrom: 3,
  },

  /**
   * How a unicorn on its feet turns: to one of the 32 facings, the body going there a few steps of
   * the ring at a time.
   */
  turn: {
    /**
     * Steps of the ring turned in one tick: the steps still to go divided by this, rounded up. The
     * last steps come one at a time, so the turn settles.
     */
    settle: 4,
    /**
     * Most steps turned in one tick, 34 degrees. A hard turn at a run is about one step a tick, so
     * this holds back only a turn that was never a curve.
     */
    fastest: 3,
    /**
     * A body does not flick one way and straight back. For this long, in seconds, after the picture
     * turns one way, a turn back the other way is held, unless it is a long one. It is longer than
     * the quarter of a second the census counts as a flicker.
     */
    holdBack: 0.3,
    /**
     * A turn back of this many steps of the ring or more is a real turn and is made at once, 56
     * degrees.
     */
    farBack: 5,
  },

  /** Keeps Wildstar where a finger can move her and gets her out of anywhere it cannot. */
  footing: {
    /**
     * She is meant to be moving and has not gone `moved` units in this many seconds: something is
     * wrong and it is put right.
     */
    patience: 2.5,
    /**
     * The distance that counts as having moved. Leaning on a tree and being nudged by it is less.
     */
    moved: 12,
    /**
     * How long since she was last put right before the next time counts as the first again. A
     * finger that was lifted takes a moment to press again, and that is not a new trouble.
     */
    forgive: 4,
    /** How often the last place she could be sent from is recorded. */
    noteEvery: 0.5,
    /** How far from everyone else she is put down, so she does not land on a friend. */
    apart: 56,
  },

  herd: {
    /** Distance between breadcrumbs. */
    crumb: 16,
    /** Trail kept behind the leader. Five followers at 130 each need 650. */
    retention: 1600,
    /** Gap to the member ahead, in herd order. Stable per character, between 100 and 130. */
    gap: { wildstar: 0, leaf: 108, glacier: 122, river: 104, cinder: 126, storm: 114 } satisfies Record<
      UnicornId,
      number
    >,
    /**
     * Least distance between the places where two members of the herd are given to stand, at rest
     * on the trail.
     */
    spacing: 100,
    /** Sideways offset from the trail center, alternating by herd slot. */
    lateral: 18,
    /** Lag at which catch-up begins and at which it is complete. */
    catchUpFrom: 24,
    catchUpFull: 220,
    /** Soft separation. */
    personal: 84,
    maxPush: 46,
    /** A follower making no progress for this long asks for a recovery path. */
    stalledAfter: 2,
    /** Beyond this distance from the leader, a stalled follower relocates instead of walking. */
    relocateFar: 900,
    /** Distance from the trail at which a recovering follower may rejoin it. */
    joinRadius: 40,
    /**
     * How far past its slot, toward the leader, a follower may step onto the trail. A follower
     * never walks back along the trail, so a spot ahead of the slot is a spot it would keep: it
     * would stand closer to the leader than the herd's spacing.
     */
    joinAhead: 6,
    /**
     * A unicorn on a route of its own is drawn walking above the first speed and standing below the
     * second, and keeps its pose in between.
     */
    walkAbove: 45,
    standBelow: 28,
    /**
     * A walking or standing pose that has been shown for less than this long is not swapped for the
     * other.
     */
    poseHold: 0.3,
    /**
     * The most a follower is drawn moving in one step, however its place swings. Its sideways
     * offset can whip round a bend the leader took in a tight curve or a zigzag, and a push can
     * arrive on top of a run at the catch-up speed (9.5 a step). A unicorn does not leap, so it
     * takes a step or two longer to get where its place has gone.
     */
    maxStep: 14,
    /**
     * A follower on the trail is judged by how fast it is meant to travel, not by every small
     * drift: the sideways offset easing out, a join closing, a nudge aside. Such drift is drawn
     * walking only when it moves the unicorn faster than one and a half times this, and stops being
     * drawn so when it falls below it.
     */
    creep: 70,
  },

  idle: {
    /** The group counts as stopped after this long without meaningful leader movement. */
    stoppedAfter: 1.5,
    /** Companions decide at random times in this range after the group stops. */
    stagger: [0.2, 1.2] as const,
    /** Anchors farther than this from Wildstar are not considered. */
    anchorReach: 280,
    /** Activities last this long, in seconds. */
    duration: [2.4, 5.6] as const,
    /** Pause between one activity and the next decision. */
    pause: [0.5, 1.8] as const,
    /** A move command shortens running activities to at most this. */
    cancelWithin: 0.5,
    /**
     * A unicorn this close to Wildstar when she sets off ends what it is doing within this short
     * time, not the longer one above.
     */
    makeWayRadius: 130,
    makeWayWithin: 0.12,
    /** Most times the same activity may repeat in a row when alternatives exist. */
    repeatLimit: 2,
    /**
     * A look round turns the unicorn at least this many steps of the ring, 34 degrees, or it is not
     * a look.
     */
    lookTurnMin: 3,
    /** Distance between the centers of two companions that nuzzle nose to nose. */
    nuzzleGap: 138,
  },

  magic: {
    /**
     * How far a spell looks for things to touch, about three unicorn lengths. Being near a thing is
     * enough for the magic to find it.
     */
    reach: 360,
    /** The most things of one kind that one spell touches, so a row of lanterns lights together. */
    each: 4,
    /** The most things that one spell touches in all, nearest first. */
    most: 8,
    /** How many of the things a spell touches throw all their sparks, nearest first. */
    shown: 1,
    /**
     * The share of their sparks that the others throw, so a crowded place stays inside the cap on
     * live particles and every thing that is touched still shows it.
     */
    lesser: 0.3,
    /** Live transient effects allowed at once. */
    effectCap: 24,
    /** Live spell voices. */
    voiceCap: 3,
    /**
     * Seconds a lantern stays lit, or a flower bed in bloom, before it goes back to how it was so
     * it can be lit again.
     */
    hold: 10,
  },

  encounter: {
    /** Greeting plays for this long. */
    greeting: 2.2,
  },

  /** The creatures that live in the world: birds, frogs, ducks, fish, butterflies, fairies. */
  life: {
    /**
     * Least distance from a wall or a tree that a creature on the ground rests at or hops through.
     * Smaller than a unicorn's.
     */
    clearance: 10,
    /**
     * Least distance between two creatures of a zone when they first settle, and from any unicorn.
     */
    apart: 36,
    fromHerd: 90,
    /** How much faster than usual a creature goes when it moves out of the way. */
    startleSpeed: 1.7,
    /** A fairy comes no closer to a unicorn than this when it flies over to look. */
    fairyLeast: 110,
    fairyMost: 190,
    /** The size of the loop a flying creature makes when it is tapped. */
    loop: 17,
    /** Where tries are made to find a place to go before it stays put a moment longer. */
    tries: 14,
  },

  /** Fruit and vegetables that fall from the trees and the beds. */
  pickups: {
    /** Most lying about at once. Beyond that the oldest is gathered by magic. */
    cap: 30,
    /** Seconds from leaving the tree to landing. */
    fall: 0.62,
    /** How close a unicorn must stand to gather one. */
    gather: 54,
    /** How far from where Wildstar stands at the tree or the bed a piece lands. */
    reachMin: 70,
    reachMax: 130,
    /** Least distance between two that landed together. */
    apart: 44,
    /** Random landing spots tried before the nearest free point is used. */
    tries: 14,
  },

  /** How often the leader's position is saved while moving. */
  autosaveEvery: 5,
} as const;
