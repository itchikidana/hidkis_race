# המירוץ של חידקי

A running-and-jumping game in Hebrew starring **חידקי**, a good bacterium.
Hidki runs through the body, jumps over junk food and pills, and catches viruses along the way.

## How to play

- **Jump:** Space, the up arrow, or a tap on the screen
- **Higher jump:** keep the key or finger pressed
- **Double jump:** press again while in the air
- **P / Esc:** pause · **M:** mute

## What's in the game

- **Hidki** is drawn in code. His arms and legs spin as he runs, his flagellum tail waves, and his body squashes and stretches on jumps. His eyes and smile always stay the same.
- **Obstacles:** sugar cubes (stacks of 1–3, sometimes two wide), lollipops, soda cans, donuts and antibiotic capsules
- **Viruses** come in lines, arcs and singles, and sometimes sit above an obstacle as a reward for jumping. Each one is worth 10 points. Catching several in a row raises the pitch of the sound. Golden viruses are worth 50.
- **Yogurt** (probiotic) gives a bubble shield that knocks away the next obstacle
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

To swap in a picture of Hidki later, replace the body in `drawHidki()` in `js/game.js` and keep the limbs and face code.
