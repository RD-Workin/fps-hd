// Builds the music stingers off the main thread (~3 s of synthesis) and streams each one back as it is ready.
import { buildMusic } from './music.js';
self.onmessage = e => {
  buildMusic(e.data.sr, (name, variants) => {
    const chans = variants[0];
    self.postMessage({ name, chans }, chans.map(c => c.buffer));
  });
  self.postMessage({ done: true });
};
