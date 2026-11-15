# Security

Unicorn Academy the Fan Game is a static web page. It has no server, no account and no telemetry, and it sends nothing off the device. Everything a player does is stored in the browser that plays it.

## Report a problem

Please do not open a public issue for a vulnerability. Use the repository's private reporting, under Security, then Report a vulnerability, and say what you did, what you saw and which browser and release you used. A fix is published before the details are.

## What counts

- A way to make the game send anything that a player did off the device, or to load a script, a picture or a sound from another address.
- A saved file, a Spell Book file or an address that runs a script or breaks the game when it is loaded. Files that are not the game's are refused with a reason, and `src/shared` holds the schemas that decide.
- A way for one copy of the game on a host to read, change or break the saves or caches of another copy on the same host.
- A secret, a key, a private address or a private name in the repository or in the history of the branch that is published. The tests under `tests/architecture` look for these, and a report of one they miss is welcome.
- A dependency with a known vulnerability that reaches the build.

Not in scope are problems that need the player's own device to be already compromised, and a browser that stores less than it was asked to.
