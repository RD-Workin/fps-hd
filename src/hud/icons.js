// Original inline SVG icons for the HUD (all drawn for this project).
const svg = (vb, body, cls = '') => `<svg class="nv-ico ${cls}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  bomb: svg('0 0 24 24',
    '<path d="M8 6.5V4.2c0-.7.5-1.2 1.2-1.2h5.6c.7 0 1.2.5 1.2 1.2v2.3" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
    '<rect x="2.5" y="6.5" width="19" height="13" rx="2.2" fill="currentColor"/>' +
    '<rect x="5.2" y="9.4" width="8.6" height="4.6" rx=".8" fill="rgba(0,0,0,.55)"/>' +
    '<circle cx="17.4" cy="11.7" r="1.7" fill="rgba(0,0,0,.55)"/>' +
    '<path d="M5.5 16.4h13" stroke="rgba(0,0,0,.45)" stroke-width="1.2"/>', 'bomb'),
  skull: svg('0 0 24 24',
    '<path fill="currentColor" fill-rule="evenodd" d="M12 2.2c-4.9 0-8.4 3.4-8.4 7.9 0 2.5 1.1 4.5 2.9 5.7v2.9c0 .6.5 1.1 1.1 1.1h1.3v-2.1h1.6v2.1h3v-2.1h1.6v2.1h1.3c.6 0 1.1-.5 1.1-1.1v-2.9c1.8-1.2 2.9-3.2 2.9-5.7 0-4.5-3.5-7.9-8.4-7.9zM8.4 8.6a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zm7.2 0a2.1 2.1 0 1 1 0 4.2 2.1 2.1 0 0 1 0-4.2zM12 13.1l1.3 2.3h-2.6z"/>', 'skull'),
  rifle: svg('0 0 48 16',
    '<path fill="currentColor" d="M1 6.2h4l1-1.6h18.5l1.2-1.6h6.8l.8 1.6H40v-1h3.5v1H47v2.4h-5.2l-1 1.2H31l-1.6 1.2h-2.6l-1.6 5.6h-4.3l1.2-5.6H14l-2.4 2.8H6.5l1.6-3.4H1z"/>', 'rifle'),
  cross: svg('0 0 24 24', '<path fill="currentColor" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>', 'cross'),
  person: svg('0 0 12 20',
    '<circle cx="6" cy="3.6" r="3" fill="currentColor"/><path fill="currentColor" d="M1.2 8.6c0-.9.7-1.6 1.6-1.6h6.4c.9 0 1.6.7 1.6 1.6V14H8.6v5.4H3.4V14H1.2z"/>', 'person'),
  speaker: svg('0 0 24 24',
    '<path fill="currentColor" d="M3 9h4l5-4.5v15L7 15H3z"/>' +
    '<path class="w1" d="M15.5 8.8a4.5 4.5 0 0 1 0 6.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path class="w2" d="M18.3 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path class="x" d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>', 'speaker'),
  play: svg('0 0 24 24', '<path fill="currentColor" d="M7 4.5v15l12.5-7.5z"/>'),
  restart: svg('0 0 24 24', '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path fill="currentColor" d="M3.5 3v6.5H10z"/>'),
  emblem: svg('0 0 100 100',
    '<defs><linearGradient id="nvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7ff0ff"/><stop offset="1" stop-color="#2a7bff"/></linearGradient></defs>' +
    '<path d="M50 4l40 23v46L50 96 10 73V27z" fill="none" stroke="url(#nvg)" stroke-width="3"/>' +
    '<path d="M50 14l31 18v36L50 86 19 68V32z" fill="none" stroke="rgba(127,240,255,.35)" stroke-width="1.2"/>' +
    '<path d="M50 22l5.5 22.5L78 50l-22.5 5.5L50 78l-5.5-22.5L22 50l22.5-5.5z" fill="url(#nvg)"/>' +
    '<circle cx="50" cy="50" r="4.5" fill="#06121c"/>', 'emblem'),
};
