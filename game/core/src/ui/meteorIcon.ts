const METEOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="Meteor">
  <defs>
    <radialGradient id="meteor-core" cx="43%" cy="43%" r="62%">
      <stop offset="0%" stop-color="#fff8b8"/>
      <stop offset="38%" stop-color="#ffb02e"/>
      <stop offset="72%" stop-color="#e43d1c"/>
      <stop offset="100%" stop-color="#7c1710"/>
    </radialGradient>
    <linearGradient id="meteor-tail" x1="14" y1="14" x2="84" y2="84">
      <stop offset="0%" stop-color="#fff5a5" stop-opacity="0.95"/>
      <stop offset="36%" stop-color="#ff9f1c" stop-opacity="0.82"/>
      <stop offset="100%" stop-color="#e43d1c" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M18 12c18 8 38 19 58 38 6 6 11 13 15 21-8-4-15-9-21-15C50 37 32 25 18 12Z" fill="url(#meteor-tail)"/>
  <path d="M38 29c13 7 27 17 42 31 5 5 10 11 14 18-7-4-13-9-18-14C61 50 49 39 38 29Z" fill="#ffd166" opacity="0.78"/>
  <circle cx="86" cy="86" r="29" fill="url(#meteor-core)"/>
  <path d="M68 80c3-12 13-20 25-20 12 0 22 8 26 19-5-18-22-31-41-26-18 5-28 24-22 42 4 12 14 20 26 23-11-7-18-22-14-38Z" fill="#ffef9f" opacity="0.72"/>
  <path d="M95 95c8-2 16 2 20 8-5 9-15 15-26 15-10 0-19-5-24-12 8 3 17 2 30-11Z" fill="#8f1d12" opacity="0.62"/>
</svg>`;

export const meteorIconDataUrl = `data:image/svg+xml,${encodeURIComponent(METEOR_SVG)}`;
