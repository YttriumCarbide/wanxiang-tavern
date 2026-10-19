import { DEFINITIONS } from './data.js';

export const WEAPONS = ['sword', 'staff', 'bow'];
export const ENEMY_ATTACKS = [
  'slime-bounce',
  'mushroom-bonk',
  'pebble-shards',
  'claw-pounce',
  'stone-slam',
  'ember-bolt',
  'gate-crush',
  'spore-volley',
  'crystal-ram',
  'cinder-spark',
  'tide-ribbon',
  'astral-cascade',
];
export const ATTACK_TIMING = {
  sword: 640,
  staff: 740,
  bow: 720,
  'slime-bounce': 700,
  'mushroom-bonk': 680,
  'pebble-shards': 760,
  'claw-pounce': 640,
  'stone-slam': 760,
  'ember-bolt': 760,
  'gate-crush': 880,
  'spore-volley': 840,
  'crystal-ram': 760,
  'cinder-spark': 740,
  'tide-ribbon': 820,
  'astral-cascade': 940,
};
export function attackStyle(event) {
  const def = event.after?.heroDefinitions?.[event.actor] || DEFINITIONS[event.actor];
  return event.type === 'hero' ? def?.weapon : event.type === 'enemy' ? def?.attackStyle : null;
}

export const combatSprites = {
  crystal: `<path fill="#3c768a" d="M9 34 25 5h14l16 29-16 25H25z"/><path fill="#92dce5" d="M14 32 28 9h8l13 23-13 22h-8z"/><path fill="#effff0" d="m29 10 5 2-3 36-7-15z"/><path fill="#5d9cb6" d="m38 16 10 17-13 18 5-20z"/>`,
  tide: `<path fill="#377d95" d="M9 14h40v8h8v23H45v12H19V45H7V24z"/><path fill="#8bd4cf" d="M15 18h30v8h8v13H41v12H23V39H11V26z"/><path fill="#d8f7ce" d="M23 22h18v16H23zM27 13h9v5h-9z"/><path fill="#d1b77c" d="M8 47h12v5H8zM43 47h12v5H43z"/>`,
  star: `<path fill="#806e50" d="m30 2 9 19 23 9-23 10-9 22-9-22L2 30l19-9z"/><path fill="#e3d29c" d="m30 7 7 18 19 5-19 7-7 19-5-19-18-7 18-5z"/><path fill="#e8fff0" d="M26 23h10v14H26zM23 26h16v8H23z"/>`,
  sword: `<path fill="#23323e" d="M31 2h7v36h-7zM19 36h31v8H19zM29 43h12v18H29z"/>
    <path fill="#c5dcde" d="M33 5h3l6 8-4 23h-9l-2-23z"/>
    <path fill="#fff5d6" d="M33 7h3v27h-3z"/><path fill="#b8d7d9" d="M29 16h3v19h-3z"/>
    <path fill="#d8b274" d="M20 37h28v5H20zM31 44h7v13h-7z"/>
    <path fill="#784e3e" d="M31 46h7v3h-7zM31 52h7v3h-7z"/>`,
  staff: `<path fill="#443548" d="M28 22h8v39h-8zM20 8h24v17l-12 8-12-8z"/>
    <path fill="#a9895d" d="M30 27h4v33h-4zM22 10h20v14l-10 6-10-6z"/>
    <path fill="#69c7cf" d="M25 9l7-7 7 7v13l-7 6-7-6z"/>
    <path fill="#daffff" d="M28 9l4-4v18l-4-3z"/>
    <path fill="#d8b67e" d="M27 33h10v4H27zM27 49h10v4H27z"/>`,
  bow: `<path d="M18 4Q64 32 18 60" fill="none" stroke="#26333b" stroke-width="10"/>
    <path d="M18 4Q59 32 18 60" fill="none" stroke="#c9a66d" stroke-width="6"/>
    <path d="M20 9Q50 32 20 55" fill="none" stroke="#f1d79c" stroke-width="2"/>
    <path d="M18 5L9 32 18 59" fill="none" stroke="#f4edcf" stroke-width="2"/>
    <path fill="#77543f" d="M35 25h8v14h-8z"/>`,
  arrow: `<path fill="#cfa978" d="M6 29h43v5H6z"/>
    <path fill="#d9ece5" d="M42 20l20 12-20 12 5-12z"/>
    <path fill="#f2e7b9" d="M4 21l15 8v6L4 43v-8H0v-6h4z"/>
    <path fill="#637d80" d="M47 32h13l-16 10z"/>`,
  orb: `<path fill="#2c7d91" d="M20 10h24v8h8v28h-8v8H20v-8h-8V18h8z"/>
    <path fill="#71d5df" d="M23 14h18v8h8v20h-8v8H23v-8h-8V22h8z"/>
    <path fill="#d9fff0" d="M24 22h16v18H24zM20 26h24v10H20z"/>
    <path fill="#fffbe2" d="M27 24h6v6h-6z"/>`,
  slime: `<path fill="#386046" d="M8 51V33h8V21h12v-6h16v8h9v10h6v18z"/>
    <path fill="#8bb978" d="M12 45V32h9v-9h20v6h11v16z"/>
    <path fill="#d4e4a1" d="M21 26h12v6H21zM21 39h5v5h-5zM40 39h5v5h-5z"/>`,
  mushroom: `<path fill="#aa7150" d="M6 29V19h9v-8h12V6h13v5h12v8h7v10z"/>
    <path fill="#e0b87b" d="M7 25h51v7H7zM27 31h11v28H27z"/>
    <path fill="#f3dfae" d="M18 14h9v7h-9zM41 16h8v6h-8z"/>
    <path fill="#8a6045" d="M30 35h5v22h-5z"/>`,
  stone: `<path fill="#2c434c" d="M15 8h31l13 18v25L40 60 9 48V21z"/>
    <path fill="#96a8a7" d="M18 12h25l11 15-17 9-23-8z"/>
    <path fill="#657f84" d="M14 30l21 9v16L14 45z"/>
    <path fill="#46626c" d="M38 39l16-9v18l-16 8z"/>
    <path d="M30 14v9l7 5-4 8" fill="none" stroke="#d1d8bd" stroke-width="3"/>`,
  fang: `<path fill="#4f2b35" d="M6 10h52v13l-9 30-9-17-8 22-8-22-9 17-9-30z"/>
    <path fill="#f0d6b2" d="M9 16h12l-5 25zM25 17h14l-7 31zM43 16h12l-6 25z"/>
    <path fill="#bd7067" d="M10 10h44v6H10z"/>`,
  hammer: `<path fill="#35434b" d="M6 5h51v28H38v29H25V33H6z"/>
    <path fill="#a5aca1" d="M9 8h45v20H9z"/><path fill="#d8cfaa" d="M10 9h42v5H10z"/>
    <path fill="#6d817d" d="M12 19h38v8H12z"/>
    <path fill="#b48b55" d="M28 30h7v30h-7z"/><path fill="#e7c885" d="M27 40h9v4h-9z"/>`,
  ember: `<path fill="#6f375d" d="M14 50V30l10-11 3-15 11 17 12 9 6 17-12 12H25z"/>
    <path fill="#e48a65" d="M20 47V32l10-11 7 9 9 4 4 13-10 8H28z"/>
    <path fill="#ffe3a1" d="M27 45V33l8 7 3-10 7 15-7 7h-7z"/>`,
  fist: `<path fill="#38484d" d="M4 15h10V7h13v4h13V7h13v9h8v29L46 59H20L4 44z"/>
    <path fill="#acaa8e" d="M8 20h10V11h7v5h17v-5h8v10h7v21L43 55H22L8 41z"/>
    <path fill="#e2d5a7" d="M10 21h8v18h-8zM21 18h8v21h-8zM32 18h8v21h-8zM43 21h8v18h-8z"/>
    <path fill="#6f7f76" d="M20 41h24v8H20z"/>`,
  spore: `<path fill="#57416f" d="M8 33V19h9V9h30v10h9v14H39v23H25V33z"/>
    <path fill="#b49acc" d="M12 29v-8h9v-8h22v8h9v8zM28 33h8v21h-8z"/>
    <path fill="#eee1bc" d="M20 19h7v6h-7zM38 18h7v6h-7z"/>
    <path fill="#8ed1be" d="M7 43h6v6H7zM49 40h7v7h-7zM18 54h5v5h-5z"/>`,
};
