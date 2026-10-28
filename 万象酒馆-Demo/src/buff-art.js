import { html } from './shared/html.js';

// Draw on a 64-pixel grid while retaining the existing 16px presentation size.
// Silhouettes convey the effect; highlights, seams and chips provide close-up detail.
const artwork = {
  sinkingPlague: html`<path fill="#241b34" d="M5 5h54v54H5z" /><path
      fill="#8f63ac"
      d="M8 42h48v8H8zM14 32h8v10h-8zM42 30h8v12h-8z"
    /><path fill="#b8cf79" d="M27 12h10v7h7v13H20V19h7z" /><path
      fill="#342445"
      d="M25 23h5v5h-5zM35 23h5v5h-5z"
    /><path fill="#d1b4e4" d="m29 37 5 4-5 4h7l-5 5 3 5h-6l-2-6 4-6-4-4z" />`,
  meteor: html`<path fill="#213943" d="M8 7h48v50H8z" /><path
      fill="#a9e4e5"
      d="m36 10 4 14 14 4-14 4-4 14-4-14-14-4 14-4z"
    /><path fill="#eed49b" d="m18 35 3 7 7 3-7 3-3 8-3-8-8-3 8-3z" />`,
  sacrifice: html`<path fill="#30223d" d="M9 7h46v50H9z" /><path
      fill="#e4c7a2"
      d="M18 15h28v23l-7 9H25l-7-9z"
    /><path fill="#6b315d" d="M22 23h7v8h-7zM35 23h7v8h-7zM28 37h8v5h-8z" /><path
      fill="#c990d6"
      d="M12 51h40v4H12zM30 8h4v9h-4z"
    />`,
  balance: html`<path fill="#173143" d="M9 5h46v54H9z" /><path
      fill="#32586d"
      d="M13 9h38v46H13z"
    /><path fill="#b5e9ef" d="M30 13h4v36h-4zM16 21h32v4H16z" /><path
      fill="#e5cb87"
      d="M18 25 9 43h18zm28 0L37 43h18zM21 51h22v4H21z"
    /><path fill="#f5f4cf" d="M15 38h8v3h-8zM43 38h8v3h-8zM28 16h8v4h-8z" /><path
      fill="#71b6ca"
      d="M18 45h10v3H18zM37 45h10v3H37z"
    />`,
  haste: html`<path fill="#28354d" d="M27 5h18v25l10 10v15H12V43l15-12z" /><path
      fill="#8faad3"
      d="M31 9h10v23l10 10v9H17v-6l14-11z"
    /><path fill="#dfd6a5" d="M31 14h10v5H31zM23 42h26v5H23z" /><path
      fill="#b9d8f1"
      d="M4 19h19v5H4zM8 28h15v4H8zM3 36h15v4H3z"
    /><path fill="#f9edc3" d="M34 20h3v9h-3zM19 48h27v3H19z" /><path
      fill="#647fa9"
      d="M37 32h4l8 9h-8z"
    />`,
  bind: html`<path fill="#27243d" d="M12 5h40v54H12z" /><path
      fill="#a28bc6"
      d="M16 9h32v46H16z"
    /><path fill="#292a42" d="M20 13h24v38H20z" /><path
      fill="#efdfad"
      d="M29 18h5v15h10v5H29zM23 15h3v5h-3zM38 15h3v5h-3zM23 45h3v4h-3zM38 45h3v4h-3z"
    /><path fill="#d1b9f0" d="M6 25h6v17H6zM52 20h6v17h-6zM8 27h48v4H8zM8 37h48v4H8z" />`,
  iron: html`<path fill="#172d36" d="M20 5h24v5l13 6-4 16h-5v25H16V32h-5L7 16l13-6z" />
    <path fill="#718d9d" d="M22 9h20v7l11 4-3 8h-7v24H21V28h-7l-3-8 11-4z" />
    <path fill="#d7e4e3" d="M24 10h16v6l-8 7-8-7zM14 20l7-2v8h-9zM43 18l7 2 2 6h-9z" />
    <path fill="#b3cbd2" d="M24 24h6v24h-6zM34 24h6v24h-6zM21 49h22v5H21z" />
    <path fill="#465f72" d="M30 24h4v25h-4zM22 32h8v3h-8zM34 32h8v3h-8z" />
    <path fill="#f5edcb" d="M15 21h3v3h-3zM46 21h3v3h-3zM23 50h3v3h-3zM38 50h3v3h-3z" />
    <path fill="#eaf6ee" d="M24 25h3v5h-3zM35 25h3v4h-3z" />`,
  guard: html`<path fill="#362e27" d="M13 7h38v27l-5 11-14 14-14-14-5-11z" />
    <path fill="#c79a4f" d="M17 11h30v22l-4 9-11 11-11-11-4-9z" />
    <path fill="#ffe2a1" d="M19 13h26v5H19zM19 18h4v17h-4zM23 37l9 10v5L21 41z" />
    <path fill="#735735" d="M25 20h16v12l-3 8-6 6-6-6-3-8V20z" />
    <path fill="#e6c37a" d="M29 23h6v15h-6zM25 27h14v5H25z" />
    <path fill="#fff3c8" d="M7 22h5v6H7zM3 26h7v3H3zM52 22h5v6h-5zM54 26h7v3h-7z" />
    <path fill="#8f6b3f" d="M34 48l9-10v5l-9 10zM17 13h3v3h-3zM44 13h3v3h-3z" />`,
  strength: html`<path fill="#543434" d="M10 32h6V18h8V9h9v3h9v5h9v18l-7 7v14H21V45L10 39z" />
    <path fill="#d78753" d="M14 33h6V21h7V13h5v4h9v4h6v12l-8 8v11H25V43l-11-7z" />
    <path fill="#ffc38a" d="M23 22h5v12h-5zM30 17h5v16h-5zM37 21h5v12h-5zM16 33h7v5h-7z" />
    <path fill="#995031" d="M22 36h20v5H22zM26 43h13v5H26z" />
    <path fill="#dcc07a" d="M22 49h21v8H22z" />
    <path fill="#fff0bd" d="M25 51h12v3H25zM5 15h3v8H5zM50 8h4v7h-4zM54 17h6v3h-6z" />
    <path fill="#814d37" d="M39 51h3v4h-3z" />`,
  weak: html`<path fill="#263443" d="M20 6h13l6 21-8 7-6-5-8-15zM33 37l8-6 11 12-5 7-8-2-4-5z" />
    <path fill="#b2bdc8" d="M23 10h7l5 15-5 4-4-4-5-12zM36 38l5-3 7 8-3 4-5-2z" />
    <path fill="#e0e3dc" d="M24 11h4l6 14-3 2zM39 37h3l5 6-3 1z" />
    <path fill="#b8905e" d="M24 44l6-5 10 13-5 4zM17 46l16-13 4 5-16 13z" />
    <path fill="#67576a" d="M23 48l4-3 5 6-4 4z" />
    <path fill="#c7b3dd" d="M9 30h5v9H9zM6 36h11l-5 8zM48 13h4v9h-4zM45 20h10l-5 7z" />
    <path fill="#8392a5" d="M27 31h3v3h-3zM39 27h4v4h-4z" />`,
  vulnerable: html`<path fill="#422b3c" d="M12 7h40v26l-6 12-14 14-14-14-6-12z" />
    <path fill="#b5758d" d="M16 11h32v21l-5 10-11 11-11-11-5-10z" />
    <path fill="#edb6c4" d="M18 13h28v5H18zM18 18h5v14h-5zM23 35l7 8-3 5-8-11z" />
    <path fill="#76546e" d="M25 20h15v14l-8 12-8-12z" />
    <path fill="#2b2937" d="M35 9h6l-8 15 8 5-13 18-3-3 8-13-8-6z" />
    <path fill="#ffdcda" d="M36 12h2l-8 13 7 4-10 14 7-13-8-5z" />
    <path fill="#e98991" d="M3 26h6v4H3zM54 32h7v4h-7zM49 46h5v5h-5z" />`,
  regen: html`<path fill="#173f36" d="M11 37V22h8V12h19V7h16v19l-9 12-13 6-10 12h-8l10-16z" />
    <path fill="#4c9b67" d="M15 34V24h8v-9h16v-4h11v14l-8 10-14 6-10 11h-3l13-17z" />
    <path fill="#9fd998" d="M23 23v-5h15v-4h9v8H35v5H24v7h-7v-8z" />
    <path fill="#c9efae" d="M20 41l22-22 3 3-22 22z" />
    <path fill="#326846" d="M29 26h4v8h-4zM36 19h4v9h-4zM22 34h8v4h-8z" />
    <path fill="#e3efc0" d="M43 39h8v6h6v8h-6v6h-8v-6h-6v-8h6z" />
    <path fill="#72be86" d="M46 42h2v14h-2zM40 48h14v2H40z" />`,
  poison: html`<path fill="#263038" d="M22 4h20v13l9 15 4 9v14H9V41l4-9 9-15z" />
    <path fill="#8d7669" d="M25 5h14v7H25z" />
    <path fill="#c5c6d8" d="M25 14h14v8l9 13 3 8v9H13v-9l3-8 9-13z" />
    <path fill="#5b9e56" d="M18 35h28l4 9v7H14v-7z" />
    <path fill="#a9db78" d="M17 36h29v4H17zM18 42h4v6h-4z" />
    <path fill="#dbe9c3" d="M26 29h12v4h4v10h-5v4H27v-4h-5V33h4z" />
    <path fill="#344745" d="M26 34h5v5h-5zM34 34h5v5h-5zM30 41h5v3h-5z" />
    <path fill="#f7eee1" d="M26 16h3v8h-3zM16 27h3v4h-3z" />
    <path fill="#b7d881" d="M45 17h5v5h-5zM15 9h4v4h-4z" />`,
  slow: html`<path
      fill="#323b3d"
      d="M13 5h38v9l-7 4v8l-8 6 8 6v10l7 3v8H13v-8l7-3V38l8-6-8-6v-8l-7-4z"
    />
    <path fill="#c5a567" d="M16 7h32v6H16zM16 52h32v5H16z" />
    <path fill="#e3f3e3" d="M24 17h16v8l-8 6-8-6zM24 39l8-7 8 7v10H24z" />
    <path fill="#76bac7" d="M25 22h14v3l-7 5-7-5zM31 33h3v10h-3zM26 45h12v4H26z" />
    <path fill="#f5dc9e" d="M18 8h24v2H18zM18 53h25v2H18z" />
    <path fill="#6c6e60" d="M18 16h3v33h-3zM43 16h3v33h-3z" />
    <path fill="#fff8de" d="M26 18h3v4h-3zM37 39h2v5h-2z" />`,
  bleed: html`<path
      fill="#45262e"
      d="M30 3h5v7l5 7 5 9 5 10v12l-6 8-9 5H24l-10-7-4-9V34l7-12 9-12z"
    />
    <path fill="#bc4f5c" d="M31 9h2v5l6 8 5 8 4 8v9l-6 7-9 4h-8l-8-6-4-8v-9l7-11 9-12z" />
    <path fill="#ec7b78" d="M28 17h4l-6 14-5 8v9l-4-5v-7l6-11z" />
    <path fill="#f8b3a0" d="M22 34h4v9h-4zM24 44h4v4h-4z" />
    <path fill="#872f49" d="M37 32h4v13l-7 8h-8v-3h6l5-7z" />
    <path fill="#dacbbb" d="M48 9h4v13h-4zM44 13h12v4H44z" />
    <path fill="#ed8e7d" d="M53 33h4v7h-4zM55 41h5v6h-5z" />`,
  shield: html`<path fill="#203446" d="M12 7h40v25l-6 13-14 14-14-14-6-13z" />
    <path fill="#729aa9" d="M16 11h32v20l-5 11-11 11-11-11-5-11z" />
    <path fill="#cee3df" d="M18 13h28v4H18zM18 17h4v15h-4zM22 34l9 12v5l-12-15z" />
    <path fill="#416a82" d="M24 20h16v12l-3 7-5 6-5-6-3-7z" />
    <path fill="#e9d39a" d="M29 23h6v6h6v6h-6v6h-6v-6h-6v-6h6z" />
    <path fill="#fff4d3" d="M30 24h3v7h-7v2h7v6h-3v-6h-5v-3h5z" />
    <path fill="#36546b" d="M37 46l6-8v5l-8 9z" />
    <path fill="#f2f8e6" d="M15 10h3v3h-3zM46 10h3v3h-3z" />`,
  overload: html`<path fill="#152b48" d="M10 8h44v48H10z" />
    <path fill="#2c699a" d="M14 12h36v40H14z" />
    <path fill="#04d9ff" d="M28 6l-8 24h12l-6 28 22-30H36l8-22z" />
    <path fill="#a6f4ff" d="M30 14l-5 14h10l-4 18 14-20H35l6-12z" />
    <path fill="#ffeb3b" d="M32 20h4v6h-4zm-2 10h6v4h-6zm4 8h3v4h-3z" />
    <path fill="#ffffff" d="M31 16h2v8h-2zm2 14h2v6h-2z" />`,
  mark: html`<path fill="#292c45" d="M18 5h28l13 27-13 27H18L5 32z" />
    <path fill="#657ca1" d="M21 9h22l12 23-12 23H21L9 32z" />
    <path fill="#cfdbef" d="m32 12 13 20-13 20-13-20z" />
    <path fill="#dfbd78" d="m32 20 8 12-8 12-8-12z" />
    <path fill="#fff5cd" d="M30 25h4v14h-4zM25 30h14v4H25z" />
    <path fill="#9db4d9" d="M13 29h4v6h-4zM47 29h4v6h-4z" />`,
};

export function icon(key) {
  return html`<svg viewBox="0 0 64 64" aria-hidden="true" shape-rendering="crispEdges">
    ${artwork[key] || ''}
  </svg>`;
}
