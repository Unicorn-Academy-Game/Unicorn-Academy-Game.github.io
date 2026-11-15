import { lifeSubject, propSubject, type SubjectId, unicornSubject } from '../content/lexicon';
import { PROP_DEFS } from '../content/props';
import type { Command, DomainEvent, World } from '../domain';
import { dispatch } from '../domain';
import type { UnicornId } from '../shared/ids';
import type { LessonPort, Place } from './ports';

/**
 * Where the world and the lesson meet. It turns what the player tapped and what the world answered
 * into what the lesson needs to know, and turns what the lesson says back into commands for the
 * world. The world never hears of lessons, and the lesson never sees the world: this is the one
 * place that sees both.
 *
 * With no lesson every call does nothing, except that a friend who is waiting joins at once, as if
 * there were nothing to ask.
 */
export class LessonLink {
  private lesson: LessonPort | undefined;
  private joins = 0;

  /**
   * `current` is the world on the screen now. A thing remembered about an older world is dropped,
   * never carried into the new one.
   */
  constructor(private readonly current: () => World) {}

  /** From now on the lesson is asked. */
  attach(lesson: LessonPort): void {
    this.lesson = lesson;
  }

  /**
   * Before a tap's command is sent. A tap on something that gives fruit away goes to the lesson
   * first. True when a card comes up: `send` is then called once, when the word is spelled, and
   * never when the player closes the card instead.
   */
  holds(command: Command, send: () => void): boolean {
    if (!this.lesson || command.type !== 'interact') return false;
    const world = this.current();
    const def = PROP_DEFS[world.interactables.get(command.instanceId)?.definitionId ?? ''];
    if (def?.tap !== 'harvest') return false;
    return this.lesson.hold(propSubject(def.id), () => {
      // The world is held still under the card, so it is the same one. A tap for a place the player
      // has left is not sent to the next.
      if (world === this.current()) send();
    });
  }

  /**
   * After a tap's command was sent. A tap on a friend is a reason to ask for her name once the herd
   * has answered.
   */
  tapped(command: Command): void {
    if (command.type !== 'cast') return;
    const actor = this.current().unicorns[command.unicornId];
    // A cast for someone who is not here did nothing, so there is nothing to ask about.
    if (!actor) return;
    this.lesson?.touched(unicornSubject(command.unicornId), () => ({
      at: { x: actor.pos.x, y: actor.pos.y },
      lift: 0,
    }));
  }

  /** For each thing the world says happened. */
  event(e: DomainEvent): void {
    switch (e.type) {
      case 'friend-met':
        this.friendWaits(e.unicornId);
        return;
      case 'friend-away':
        this.lesson?.away(e.unicornId);
        return;
      case 'critter-poked':
        this.critterAnswered(e.critterId, lifeSubject(e.kind), { at: e.at, lift: e.z });
        return;
      case 'prop-activity':
        // A treasure or a thing that delights the player says this once the herd has got to it and
        // it has answered the tap.
        if (e.activity === 'treasure-bounce' || e.activity === 'treasure-float' || e.activity === 'delight')
          this.propAnswered(e.instanceId);
        return;
      default:
        return;
    }
  }

  /**
   * The game is under way. A friend who was already waiting, because she was saved standing beside
   * one, is put to the lesson now.
   */
  begun(): void {
    for (const id of [...this.current().met]) this.friendWaits(id);
  }

  /** The place the player was in is gone. */
  newPlace(): void {
    this.lesson?.newPlace();
  }

  /**
   * A friend who has not been found stands waiting. She joins when her name is spelled, or at once
   * when there is nothing to ask.
   */
  private friendWaits(unicornId: UnicornId): void {
    const world = this.current();
    const join = (): void => {
      // She was met in the place she is in. After the herd has left it there is no one to join.
      if (world === this.current()) dispatch(world, { type: 'befriend', commandId: `join-${++this.joins}`, unicornId });
    };
    if (this.lesson) this.lesson.met(unicornId, join);
    else join();
  }

  /**
   * A creature has answered a tap. It is found again when the word is done, as it may have moved.
   */
  private critterAnswered(critterId: string, subject: SubjectId, poked: Place): void {
    const world = this.current();
    this.lesson?.touched(subject, () => {
      const critter = world.life.critters.find((c) => c.id === critterId);
      return critter ? { at: { x: critter.pos.x, y: critter.pos.y }, lift: critter.z } : poked;
    });
  }

  /**
   * A treasure, or a thing that delights the player, has answered a tap. A toy that opens a game
   * and a clue are delighted too, and have no word to give. The shimmer for the word stands where
   * the thing's own did, which is higher than the thing for some.
   */
  private propAnswered(instanceId: string): void {
    const inst = this.current().interactables.get(instanceId);
    const def = inst && PROP_DEFS[inst.definitionId];
    if (!inst || (def?.tap !== 'treasure' && def?.tap !== 'delight')) return;
    const place: Place = { at: { x: inst.pos.x, y: inst.pos.y }, lift: def.delight?.lift ?? 0 };
    this.lesson?.touched(propSubject(inst.definitionId), () => place);
  }
}
