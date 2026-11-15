import { describe, expect, it } from 'vitest';
import { type Contact, Contacts, type Kind, type PointerSink } from './contacts';
import { HOLD_MS, REST_MS, TAP_MS, TAP_SLOP } from './gesture';

function rig(thing = false) {
  const calls: string[] = [];
  let found = 0;
  const sink: PointerSink = {
    thingAt: () => thing,
    tap: (w) => calls.push(`tap ${w.x},${w.y}`),
    lead: (c) => calls.push(`lead ${c.x},${c.y}`),
    release: () => calls.push('release'),
    found: () => {
      found += 1;
    },
  };
  return { calls, found: () => found, contacts: new Contacts(sink) };
}

const at = (x: number, y: number) => ({ x, y });
const contact = (id: number, x: number, y: number, primary = true, kind: Kind = 'touch'): Contact => ({
  id,
  kind,
  primary,
  css: at(x, y),
});

describe('one finger', () => {
  it('leads from the moment it lands, follows it, and lets go when it lifts', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(1000, 1000), 0);
    contacts.move(contact(1, 150, 100), 50);
    contacts.up(contact(1, 150, 100), at(1500, 1000), 900);
    expect(calls).toEqual(['lead 100,100', 'lead 150,100', 'release']);
    expect(contacts.active).toBe(false);
  });

  it('is a tap when it lifts at once and in place, at the world point it lifted on', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(1000, 1000), 0);
    contacts.up(contact(1, 100, 100), at(1004, 1000), TAP_MS - 20);
    expect(calls).toEqual(['lead 100,100', 'release', 'tap 1004,1000']);
  });

  it('waits to see what a press on something is, and leads once it is held', () => {
    const { calls, contacts } = rig(true);
    contacts.down(contact(1, 100, 100), at(1000, 1000), 0);
    expect(calls).toEqual([]);
    contacts.hold(HOLD_MS - 1);
    expect(calls).toEqual([]);
    contacts.hold(HOLD_MS);
    expect(calls).toEqual(['lead 100,100']);
  });
});

describe('a lift that is never heard', () => {
  it('is dropped when the browser says a contact of the same kind is the only one down', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    // Nothing says finger 1 lifted. Finger 2 lands, and the browser says it is the first and only
    // one.
    contacts.down(contact(2, 400, 300), at(0, 0), 5000);
    expect(calls).toEqual(['lead 100,100', 'release', 'lead 400,300']);
    contacts.up(contact(2, 400, 300), at(4000, 3000), 5060);
    expect(calls).toEqual(['lead 100,100', 'release', 'lead 400,300', 'release', 'tap 4000,3000']);
  });

  it('is dropped even when the new contact has the same number as the old', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(7, 100, 100), at(0, 0), 0);
    contacts.down(contact(7, 300, 200), at(0, 0), 9000);
    expect(calls).toEqual(['lead 100,100', 'release', 'lead 300,200']);
  });

  it('is not taken for lost when another kind of contact lands, because a mouse is always the first mouse', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.down(contact(1, 400, 300, true, 'mouse'), at(0, 0), 50);
    expect(calls).toEqual(['lead 100,100']);
    expect(contacts.state()).toEqual({ pressed: true, leading: true, id: 1, kind: 'touch' });
  });

  it('is let go when the page says the contact is gone, and what it did after is not a tap', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.lost(1);
    expect(calls).toEqual(['lead 100,100', 'release']);
    contacts.up(contact(1, 100, 100), at(0, 0), 20);
    expect(calls).toEqual(['lead 100,100', 'release']);
  });

  it('is a press that is gone for good once everything is cleared, with nothing to tap', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.clear();
    contacts.clear();
    expect(calls).toEqual(['lead 100,100', 'release']);
    expect(contacts.state()).toEqual({ pressed: false, leading: false, id: null, kind: null });
  });

  it('starts a new press from a contact the browser calls second when none is held', () => {
    const { calls, contacts } = rig();
    // The first finger lifted and the second stayed, so the third is not the browser's first, and
    // nothing is held.
    contacts.down(contact(3, 200, 200, false), at(0, 0), 100);
    expect(calls).toEqual(['lead 200,200']);
  });
});

describe('a lift that is never heard, counted', () => {
  it('is said once when a contact the browser calls the only one lands on a press that is still held', () => {
    const { found, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    expect(found()).toBe(0);
    contacts.down(contact(2, 400, 300), at(0, 0), 5000);
    expect(found()).toBe(1);
    // That one lifts as it should, and the next press has nothing held to find.
    contacts.up(contact(2, 400, 300), at(0, 0), 5060);
    contacts.down(contact(3, 200, 200), at(0, 0), 9000);
    expect(found()).toBe(1);
  });

  it('is said when a mouse is found with its button up while the game holds a press', () => {
    const { calls, found, contacts } = rig();
    contacts.down(contact(1, 100, 100, true, 'mouse'), at(0, 0), 0);
    contacts.lifted(1);
    expect(found()).toBe(1);
    expect(calls).toEqual(['lead 100,100', 'release']);
    expect(contacts.active).toBe(false);
  });

  it('is not said for what the browser told, nor for a press that was only put aside', () => {
    const lifts = rig();
    lifts.contacts.down(contact(1, 100, 100), at(0, 0), 0);
    lifts.contacts.lost(1);
    lifts.contacts.down(contact(1, 100, 100), at(0, 0), 100);
    lifts.contacts.clear();
    lifts.contacts.lifted(1);
    expect(lifts.found(), 'lost, cleared, and a mouse that was not holding anything').toBe(0);

    const other = rig();
    other.contacts.down(contact(1, 100, 100), at(0, 0), 0);
    // A mouse is always the first mouse, and a second finger is not the browser's only one.
    other.contacts.down(contact(1, 400, 300, true, 'mouse'), at(0, 0), 50);
    other.contacts.down(contact(2, 400, 300, false), at(0, 0), 60);
    expect(other.found()).toBe(0);
  });
});

describe('a second finger', () => {
  it('leads no one while the first is down', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.down(contact(2, 400, 400, false), at(0, 0), 10);
    contacts.move(contact(2, 600, 600, false), 20);
    contacts.up(contact(2, 600, 600, false), at(0, 0), 30);
    expect(calls).toEqual(['lead 100,100']);
    expect(contacts.state().leading).toBe(true);
  });

  it('can tap, once the first has rested for a while, and the first then has no say', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.down(contact(2, 400, 300, false), at(0, 0), REST_MS + 100);
    contacts.up(contact(2, 400, 300, false), at(4000, 3000), REST_MS + 150);
    expect(calls).toEqual(['lead 100,100', 'release', 'tap 4000,3000']);
    // Where the resting finger goes now, or when it lifts, is nothing.
    contacts.move(contact(1, 160, 100), REST_MS + 400);
    contacts.up(contact(1, 160, 100), at(1600, 1000), REST_MS + 500);
    expect(calls).toEqual(['lead 100,100', 'release', 'tap 4000,3000']);
    expect(contacts.active).toBe(false);
  });

  it('cannot tap before the first has rested, so a pinch or a brush of the other hand is no command', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.down(contact(2, 400, 300, false), at(0, 0), REST_MS - 100);
    contacts.up(contact(2, 400, 300, false), at(4000, 3000), REST_MS - 50);
    expect(calls).toEqual(['lead 100,100']);
    expect(contacts.state().leading).toBe(true);
  });

  it('cannot tap while the first is being steered, however long it has been down', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.move(contact(1, 160, 100), REST_MS * 2);
    contacts.down(contact(2, 400, 300, false), at(0, 0), REST_MS * 2 + 100);
    contacts.up(contact(2, 400, 300, false), at(4000, 3000), REST_MS * 2 + 150);
    expect(calls).toEqual(['lead 100,100', 'lead 160,100']);
  });

  it('is a tap only if it is quick and stays where it landed', () => {
    for (const how of ['held', 'wandered', 'lost'] as const) {
      const { calls, contacts } = rig();
      contacts.down(contact(1, 100, 100), at(0, 0), 0);
      const landed = REST_MS + 100;
      contacts.down(contact(2, 400, 300, false), at(0, 0), landed);
      if (how === 'wandered') contacts.move(contact(2, 400 + TAP_SLOP + 5, 300, false), landed + 30);
      if (how === 'lost') contacts.lost(2);
      const lifts = how === 'held' ? landed + TAP_MS + 50 : landed + 60;
      contacts.up(contact(2, 400, 300, false), at(4000, 3000), lifts);
      expect(calls, how).toEqual(['lead 100,100']);
    }
  });

  it('is forgotten when the first lifts, so what it does after is nothing', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.down(contact(2, 400, 300, false), at(0, 0), REST_MS + 100);
    contacts.up(contact(1, 100, 100), at(0, 0), REST_MS + 120);
    contacts.up(contact(2, 400, 300, false), at(4000, 3000), REST_MS + 150);
    expect(calls).toEqual(['lead 100,100', 'release']);
  });

  it('is forgotten when everything is cleared', () => {
    const { calls, contacts } = rig();
    contacts.down(contact(1, 100, 100), at(0, 0), 0);
    contacts.down(contact(2, 400, 300, false), at(0, 0), REST_MS + 100);
    contacts.clear();
    contacts.up(contact(2, 400, 300, false), at(4000, 3000), REST_MS + 150);
    expect(calls).toEqual(['lead 100,100', 'release']);
  });
});
