// Renders the store / native icons from the vector logo (assets/brand/logo.svg).
// Usage: node scripts/generate-icons.js  (needs `@resvg/resvg-js`, e.g. `npx -p @resvg/resvg-js node scripts/generate-icons.js`)
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const out = (name) => path.join(__dirname, '..', 'assets', name);
// The mark without its rounded background, drawn in a 100x100 box.
const mark = (fill, coin) => `
  <rect x="22" y="56" width="15" height="22" rx="4" fill="${fill}"/>
  <rect x="42.5" y="44" width="15" height="34" rx="4" fill="${fill}"/>
  <rect x="63" y="32" width="15" height="46" rx="4" fill="${fill}"/>
  <circle cx="70.5" cy="20" r="9" fill="${coin}"/>`;
const svg = (body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}${body}</svg>`;
// Scale the mark around the center so it fits Android's adaptive-icon safe zone.
const scaled = (body, s) => `<g transform="translate(${50 - 50 * s} ${50 - 50 * s}) scale(${s})">${body}</g>`;

function render(file, source, size) {
  const png = new Resvg(source, { fitTo: { mode: 'width', value: size } }).render().asPng();
  fs.writeFileSync(out(file), png);
  console.log(`${file} ${size}x${size}`);
}

// iOS: square, opaque, no rounded corners (iOS applies its own mask).
render('icon.png', svg(mark('#FFFFFF', '#10B981'), '#2563EB'), 1024);
render('android-icon-foreground.png', svg(scaled(mark('#FFFFFF', '#10B981'), 0.62)), 1024);
render('android-icon-background.png', svg('', '#2563EB'), 1024);
render('android-icon-monochrome.png', svg(scaled(mark('#FFFFFF', '#FFFFFF'), 0.62)), 1024);
render('splash-icon.png', fs.readFileSync(path.join(__dirname, '..', 'assets', 'brand', 'logo.svg'), 'utf8'), 1024);
render('favicon.png', fs.readFileSync(path.join(__dirname, '..', 'assets', 'brand', 'logo.svg'), 'utf8'), 48);
