# This Side Up

**Use it: [junkdrawer.works/this-side-up](https://junkdrawer.works/this-side-up/)**

**Number every box in a move and know what's in each one.** Say what's in a box, which room it's leaving and which room it's going to, and whether it's fragile, heavy, to be opened first or going in the car. Print labels with a QR code any phone can read, tick the boxes onto the truck and off again on moving day, and find the kettle on the first night.

## How it works

- **Pack.** Each box gets the next number (or any free number, to match a box you've already numbered elsewhere). Pick the room it's leaving and the room it's going to (Kitchen to Kitchen picks itself), list what's in it a line at a time, and tick Fragile, Heavy, Open first or Goes in the car. The label draws itself as you type. Then the next box is ready, in the same rooms.
- **Furniture counts too.** The sofa, the bed frame and the bike get numbers and labels like the boxes, so they're on the count.
- **Labels that look like the real thing.** A box number you can read across a garage, the room it's going to in its colour, a red FRAGILE stamp, OPEN FIRST, HEAVY and GOES IN THE CAR bands, the first few things inside, the this-way-up arrows and a QR code. They print true to size on Avery 5164/8164 (3⅓ × 4 in, six to a sheet), 5168 (3½ × 5 in, four) or 5126 half sheets (two, with a list of what's inside), or on plain Letter or A4 paper with cut lines. Start part-way down a sheet you've already used. A test sheet and nudges line them up with your printer.
- **A code any phone can read.** The label's QR code carries the box itself in its link, after the #: the number, the rooms, the flags and roughly the first 120 characters of what's inside, kept short enough (a version 10 code) to scan at about 1½ inches. Point any phone camera at it and it shows what's in the box and which room it goes to, with nothing to install. On a phone that has this move's list, it opens the box in the list instead.
- **Door signs.** One page per room at the new place, in that room's colour and shape, for taping on its door. The colours are Okabe and Ito's set, chosen so people with colour-blindness can tell them apart, and every room has its own shape too, so a box still matches its door on a black-and-white printer.
- **Moving day.** A big number pad for a thumb, with a box in the other arm. Key in a box's number as it goes onto the truck: it shows which box that is before you tick it, says so if there's no such box or it's already on, and warns about the ones that go in the car. At the other end it says which room to take each box to. Room by room, with a list of what's missing (by the room to look in), until the truck pulls away and "All 87 boxes made it".
- **Unpack and find things.** Tick boxes off as you empty them. Search covers everything: "kettle" → Box 12, Kitchen, open first.
- **The first night.** The boxes marked Open first, and a check that the sheets, the towels, the kettle, the chargers and the dog's bowl are actually in one of them.
- **NFC stickers.** With [Tag Along](https://junkdrawer.works/tag-along/) set to `https://junkdrawer.works/this-side-up/#box/`, each sticker opens its box here (`#box/012` is Box 12).
- **Two phones.** Send the whole list to another phone as a link, or save a backup file (with the box photos), and open it there. When both have changed things, send it again: the lists are merged box by box, the newer change to each box wins, ticks from the truck come through from both, and two boxes packed with the same number at once are flagged to renumber.
- **One set of box numbers.** If [Brickyard](https://brickyard.junkdrawer.works/) or Parts Bin already say a LEGO set or a bag of parts is in Box 12, give that box number 12 here too: any free number will do, not just the next one.
- No account and no server. The list stays in your browser (and the photos in its IndexedDB) unless you send it. You can save it as a spreadsheet for the movers or the insurance. It works offline, in a new house with no Wi-Fi yet, and installs to a phone's home screen.

## Running it

It's a static site: plain HTML, CSS and JavaScript modules, with no build step.

```sh
npx serve .                   # or any static file server, then open the printed address
npm install                   # only for the tests: zxing-wasm (reads QR codes) and upng-js (reads PNGs)
npm test                      # the list, links, label sheets and QR codes (Node 20+), then the app in Chromium (needs Playwright)
node tools/make-icons.mjs     # redraws the PNG icons from icon.svg
```

The Chromium test also prints labels to PDF and reads every QR code back from where the Avery template says its label is. It uses `pdftoppm` and `pdfinfo` (poppler) for that part when they're installed, and skips it when they aren't.

To put it online with GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`.

### Files

- `js/model.js`: the list. Boxes, furniture and rooms, cleaning up anything that arrives, the next number, search, what's missing on moving day, and merging two copies. It has no page code, so the tests run it in Node.
- `js/payload.js`: what goes in a link: a label's box (`#b/…`), a Tag Along number (`#box/12`) and the whole list (`#l/…`, squeezed with deflate).
- `js/rooms.js`: the room colours and shapes, and the usual room names. `js/sheets.js`: where each label sits on each kind of sheet.
- `js/labels.js`: the label, door signs and the test sheet, sized in em so one label works at any size. `js/qr.js` draws QR codes with `js/vendor/qrcode.js`, Kazuhiko Arase's QR Code Generator (MIT), the same one While You Were Out uses.
- `js/app.js`: which screen goes with which address, and opening links that arrive. `js/home.js`: the welcome and the box list with search. `js/pack.js`: packing a box. `js/box.js`: one box, and what a phone shows when it reads a label. `js/print.js`: printing. `js/truck.js`: moving day. `js/first.js`: the first night. `js/places.js`: the rooms. `js/share.js` and `js/more.js`: another phone, backups and the spreadsheet.
- `js/store.js`: saving in the browser (the list in localStorage under `this-side-up.v1`, photos in IndexedDB). `js/ui.js` and `js/common.js`: pieces every screen uses. `js/example.js`: the example move.
- `fonts/`: Big Shoulders Stencil and Archivo (SIL Open Font License) and Permanent Marker (Apache License 2.0), served from here so nothing loads from elsewhere.
- `sw.js`: keeps a copy for using offline.
- `test/unit.test.mjs` checks the list, search, merging, links and label sheets. `test/qr.test.mjs` draws every label's code the way a phone camera sees a 1½ inch code from about 25 cm (soft, noisy, turned) and reads it back with zxing-cpp. `test/e2e.mjs` packs a move, reads a label from the screen and from the printed PDF, counts the truck both ways, and moves the list between three phones.
