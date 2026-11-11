# המירוץ של חידקי

A running-and-jumping game in Hebrew starring **חידקי**, a good bacterium.
Hidki runs through the body, jumps over junk food and pills, and catches viruses along the way.

## How to play

- **Jump:** Space, the up arrow, or a tap on the screen
- **Higher jump:** keep the key or finger pressed
- **Double jump:** press again while in the air
- **P / Esc:** pause · **M:** mute

## What's in the game

- **Hidki** is drawn in code from the family's sketch (`assets/hidki-drawing.webp`): a small round body with six bulb-tipped lobes and a dark-ink outline. All six lobes spin together as he runs, so he rolls along like a star, bobbing so the lowest lobe always touches the ground. He spins faster in the air and squashes and stretches on jumps. His dot eyes and V smile always stay the same.
- **Obstacles:** sugar cubes (stacks of 1–3, sometimes two wide), lollipops, soda cans, donuts and antibiotic capsules
- **Viruses** come in lines, arcs and singles, and sometimes sit above an obstacle as a reward for jumping. Each one is worth 10 points. Catching several in a row raises the pitch of the sound. Golden viruses are worth 50.
- **Yogurt** (probiotic) gives a bubble shield that knocks away the next obstacle
- **Peanut with a rocket** makes Hidki fly for 7 seconds. Hold the key or finger to climb and let go to glide down, with a fuel bar above him. While he flies, the world speeds up, obstacles bounce off him, and viruses come in wavy trails across the sky. When the fuel runs out he floats down with one air jump left, and the ground ahead is clear. The first prize in a run is always the rocket peanut; after that it alternates with yogurt.
- **3 hearts.** After a hit Hidki blinks and can't be hurt for a moment.
- **Zones** change every 500 m (הקיבה → המעי הדק → המעי הגס → מסלול הכוכבים), and the colours fade from one zone to the next
- Speed increases gradually. Score = meters + 10 × viruses. The best score is saved in the browser.
- Sounds are synthesised in the browser, so there are no audio files

## Running it

Open `index.html` in a browser. No build step and no dependencies (fonts load from Google Fonts).

## Files

- `index.html`: the stage, HUD and menus
- `css/style.css`: the page and menu styles
- `js/game.js`: the whole game (physics, spawning, drawing, sound)
- `assets/hidki-drawing.webp`: the original drawing of Hidki

Hidki's shape is defined in `hidkiLobes()` in `js/game.js` (lobe directions and lengths are in `LOBE_DIRS` and `LOBE_LENS`). His face is drawn in `drawFace()`.
