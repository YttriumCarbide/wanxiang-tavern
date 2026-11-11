import { COOKING_POINTS, CUP, HEAT_BAND } from '../service-cooking.js';

const px = (x) => x * 600;
const py = (y) => y * 300;
const point = ([x, y]) => [px(x), py(y)].join(',');

const board =
  '<rect x="116" y="65" width="368" height="177" rx="24" fill="url(#cook-wood)" stroke="#eac296" stroke-width="3"/><rect x="132" y="79" width="336" height="149" rx="17" fill="none" stroke="#603d39" opacity=".4"/><path d="M146 112q130-15 304 0m-303 86q130-15 297-3" fill="none" stroke="#ffe2b3" opacity=".4"/>';
const bowl = (liquid) =>
  '<ellipse cx="300" cy="167" rx="159" ry="112" fill="#17141b" opacity=".42"/><ellipse cx="300" cy="150" rx="156" ry="110" fill="url(#cook-brass)"/><ellipse cx="300" cy="150" rx="144" ry="100" fill="#553034"/><ellipse cx="300" cy="150" rx="134" ry="91" fill="' +
  liquid +
  '"/><ellipse class="cook-ripple" cx="300" cy="150" rx="120" ry="76" fill="none" stroke="#fff0c7" stroke-width="3" stroke-dasharray="70 14 25 30"/>';
const dish =
  '<ellipse cx="300" cy="159" rx="156" ry="106" fill="#182f30" opacity=".6"/><ellipse cx="300" cy="151" rx="153" ry="105" fill="#b7cbb8"/><ellipse cx="300" cy="151" rx="141" ry="94" fill="#e1e6c7"/><ellipse cx="300" cy="151" rx="119" ry="80" fill="#9ebbad" stroke="#62837c" stroke-width="3"/>';
const tools = Object.freeze({
  cut: '<path d="M-79-18H24v35h-68q-20-4-35-35z" fill="url(#cook-steel)" stroke="#506065" stroke-width="2"/><path d="M23-14h58q14 0 14 14T81 13H23z" fill="#713e3e"/><path d="M-45 13h65" stroke="#fff5dc" stroke-width="2"/><circle cx="39" r="3" fill="#f2c889"/>',
  pour: '<path d="M-50-14q-39-34-44 6t43 28" fill="none" stroke="#cd9c6b" stroke-width="8"/><path d="M29 5Q50 3 60-20l8 3q-12 43-36 43z" fill="#85b2a1" stroke="#365f60" stroke-width="3"/><ellipse cx="-13" cy="7" rx="48" ry="32" fill="url(#cook-jade)" stroke="#bcd6ae" stroke-width="2"/><path d="M-51-15q37-25 74 0z" fill="#aed1b3"/><ellipse cx="-14" cy="-28" rx="9" ry="4" fill="#efd297"/><path d="M-50 12q34 18 72 0" fill="none" stroke="#f3deb3" stroke-width="3"/>',
  stir: '<path d="M5 3l62-50" stroke="#efc27e" stroke-width="10" stroke-linecap="round"/><ellipse rx="22" ry="13" transform="rotate(-38)" fill="url(#cook-brass)" stroke="#8e5939" stroke-width="2"/>',
  heat: '<circle r="16" fill="#633c37" stroke="#f6d39b" stroke-width="3"/><path d="M-7 4L7-4" stroke="#ffe9a9" stroke-width="3" stroke-linecap="round"/>',
  roll: '<path d="M0-76V76" stroke="#894a32" stroke-width="10" stroke-linecap="round"/><rect x="-17" y="-59" width="34" height="118" rx="15" fill="url(#cook-wood)" stroke="#ffdb9e" stroke-width="2"/><path d="M-9-48v96" stroke="#ffdcac"/>',
  flip: '<path d="M4 0h57" stroke="#6a4040" stroke-width="16" stroke-linecap="round"/><path d="M12-2h39" stroke="#bc8b5e" stroke-width="3"/>',
  season:
    '<rect x="-19" y="-35" width="38" height="47" rx="12" fill="#e0b173" stroke="#633b39" stroke-width="3"/><rect x="-21" y="7" width="42" height="14" rx="5" fill="url(#cook-steel)"/><path d="M-12 16h24" stroke="#60423a" stroke-width="3" stroke-dasharray="2 4"/>',
  whisk:
    '<path d="M14-16l45-43" stroke="#8c5242" stroke-width="13" stroke-linecap="round"/><path d="M-24 22Q-53 1 27-29Q5 53-24 22Zm0 0Q-26 11 27-29Q-6 27-24 22Z" fill="none" stroke="#f0e5cb" stroke-width="3"/>',
  sear: '<path d="M12 5l55-34" stroke="#a57148" stroke-width="10" stroke-linecap="round"/><rect x="-33" y="-12" width="53" height="28" rx="6" transform="rotate(-18)" fill="url(#cook-steel)" stroke="#546466" stroke-width="2"/><path d="M-24-2l27-8m-26 15 27-8" stroke="#607576" stroke-width="3"/>',
  skim: '<path d="M12-9l57-46" stroke="#e4ae70" stroke-width="8" stroke-linecap="round"/><ellipse rx="24" ry="14" fill="#d5d6bc" stroke="#677978" stroke-width="3"/><path d="M-13-3h26m-26 7h26" stroke="#7d9086" stroke-width="3" stroke-dasharray="3 4"/>',
  knead:
    '<path d="M-23 18q-10-12-4-22l13 4-3-19q0-9 8-7l6 18 1-24q2-8 8-4l4 25 6-18q5-5 10 2l-2 22q14-8 17 0-6 16-24 29z" fill="#e9b685" stroke="#9b5c4e" stroke-width="3"/>',
  pipe: '<path d="M-10 0l-9-18 38-49q15-12 36 5L4-8z" fill="#f2cf9a" stroke="#a67356" stroke-width="3"/><path d="M-19-18L4-8-4 2-10 0z" fill="url(#cook-steel)"/>',
});

const food = Object.freeze({
  cut: '<path d="M-34-16q21-22 63-12l11 27q-9 27-57 30l-21-15z" fill="#d08157" stroke="#854735" stroke-width="3"/><path d="M-27-13Q3-31 27-20M-18 11q24-16 44-16" fill="none" stroke="#f3bb8a" stroke-width="4"/>',
  season:
    '<path d="M-27 7q-1-21 21-26t31 14q6 20-17 23t-35-11" fill="#c18b53" stroke="#704432" stroke-width="3"/><path d="M-14 6L12-8" stroke="#edbb7b" stroke-width="3"/>',
  sear: '<path d="M-30-9q3-18 34-16l27 14q12 19-13 29t-44-1z" fill="#ad5751" stroke="#71373c" stroke-width="4"/><path d="M-21 5L13-12m-23 26L23-4" stroke="#e09c80" stroke-width="3"/>',
  skim: '<ellipse rx="25" ry="12" fill="#e9d5a4" opacity=".82"/><circle cx="-10" cy="-8" r="6" fill="#f1e4bc"/><circle cx="10" cy="4" r="5" fill="#faf0cb"/>',
  knead:
    '<path d="M-18 0h30m-10-8 10 8-10 8" fill="none" stroke="#fff5cc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  pipe: '<circle r="8" fill="none" stroke="#f5e1a7" stroke-width="2" stroke-dasharray="3 3"/>',
});

const cup =
  '<ellipse cx="414" cy="245" rx="70" ry="13" fill="#251e26" opacity=".6"/><path class="cook-dock" d="M314 104q44-40 88 0" fill="none" stroke="#a9d4bc" stroke-width="3" stroke-dasharray="6 6"/><path d="M371 147h86l-12 87h-62z" fill="#9ec6b65a" stroke="#c4e0c7" stroke-width="3"/><clipPath id="cook-cup"><path d="M374 147h80l-11 85h-58z"/></clipPath><g clip-path="url(#cook-cup)"><rect data-cook-liquid x="371" y="234" width="86" height="0" fill="#d98b48"/><path d="M371 156h86v19h-86z" fill="#ffdf8d55" stroke="#ffe2a2" stroke-width="2" stroke-dasharray="5 3"/></g><ellipse cx="414" cy="147" rx="43" ry="8" fill="none" stroke="#daf0d7" stroke-width="3"/><path class="cook-stream" data-cook-stream fill="none" stroke-linecap="round"/>';
const fire =
  '<path d="M138 188V96q0-54 162-54t162 54v92z" fill="#875747" stroke="#c98e61" stroke-width="6"/><path d="M162 181v-69q0-48 138-48t138 48v69z" fill="#30212b" stroke="#dcaa75" stroke-width="5"/><g class="cook-flames"><path d="M194 172q-16-30 25-57 0 27 17 24 27-24 30-56 37 35 13 83 41-11 53-46 28 13 17 37 35-8 46-33 18 29-5 47z" fill="#db7444"/><path d="M224 173q-4-12 24-24 12 4 22 22m22-2q-3-22 20-48 11 15 14 42m19 7q9-25 25-27 0 14 9 25" fill="#f8c276"/></g><path d="M170 174h259m-219-7v12m44-12v12m44-12v12m44-12v12m44-12v12" stroke="#d2a778" stroke-width="4"/><path d="M56 243h488" stroke="#553939" stroke-width="19" stroke-linecap="round"/><path d="M' +
  px(HEAT_BAND[0]) +
  ' 243h' +
  px(HEAT_BAND[1] - HEAT_BAND[0]) +
  '" stroke="#ecb86d" stroke-width="12" stroke-linecap="round"/>';

const scenes = Object.freeze({
  cut: board,
  pour: cup,
  heat: fire,
  stir: bowl('#bd824b'),
  whisk: bowl('#d9a85d'),
  skim: bowl('#a96248'),
  roll:
    board +
    '<ellipse class="cook-dough" cx="300" cy="151" rx="101" ry="65" fill="#efc18a" stroke="#ffe2b6" stroke-width="4"/>',
  knead:
    board +
    '<path class="cook-dough" d="M170 165q-8-77 124-83t130 69q-13 80-126 73t-128-59z" fill="#e7b683" stroke="#ffe2b6" stroke-width="4"/>',
  flip: '<g data-cook-pan><ellipse cx="300" cy="166" rx="153" ry="101" fill="#25242d" stroke="#708487" stroke-width="6"/><ellipse cx="300" cy="156" rx="133" ry="83" fill="#434653"/><ellipse class="cook-pancake" cx="300" cy="155" rx="106" ry="65" fill="#e0ac69" stroke="#ebc486" stroke-width="7"/><path d="M225 155q30-50 113-29" fill="none" stroke="#ffdf9b" stroke-width="4" opacity=".54"/></g>',
  season: dish,
  sear: '<rect x="131" y="73" width="338" height="155" rx="21" fill="#3c414b" stroke="#a6a896" stroke-width="5"/><path d="M165 91v119m32-119v119m32-119v119m32-119v119m32-119v119m32-119v119m32-119v119m32-119v119m32-119v119" stroke="#60656b" stroke-width="3"/>',
  pipe:
    dish +
    '<ellipse cx="300" cy="150" rx="135" ry="85" fill="#ac6554" stroke="#e1a17d" stroke-width="9"/>',
});

function marks(kind) {
  const points = COOKING_POINTS[kind];
  if (!points) return '';
  const guide =
    kind === 'pipe'
      ? '<polyline points="' +
        points.map(point).join(' ') +
        '" fill="none" stroke="#f7ddac" stroke-width="3" stroke-dasharray="4 8"/><polyline data-cook-icing fill="none" stroke="#fff1c8" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>'
      : '';
  return (
    guide +
    points
      .map(
        (position, index) =>
          '<g class="cook-mark" data-patch="' +
          index +
          '" transform="translate(' +
          point(position) +
          ')">' +
          '<ellipse class="cook-mark-guide" rx="45" ry="39"/><g class="cook-food">' +
          food[kind] +
          '</g><path class="cook-cut-result" d="M-33 0h66" stroke="#fff0b9" stroke-width="3" stroke-dasharray="5 4"/></g>',
      )
      .join('')
  );
}

const gradients =
  '<defs><linearGradient id="cook-wood" x2=".8" y2="1"><stop stop-color="#d5a376"/><stop offset="1" stop-color="#92634f"/></linearGradient><linearGradient id="cook-steel" x2="0" y2="1"><stop stop-color="#e9edd9"/><stop offset=".52" stop-color="#a6bbb5"/><stop offset=".55" stop-color="#eff2df"/><stop offset="1" stop-color="#718a8b"/></linearGradient><linearGradient id="cook-jade" x2=".8" y2="1"><stop stop-color="#c7ddae"/><stop offset="1" stop-color="#457e76"/></linearGradient><linearGradient id="cook-brass" x2=".6" y2="1"><stop stop-color="#ffdfa2"/><stop offset="1" stop-color="#a36a4e"/></linearGradient></defs>';

export function cookingArtwork(kind) {
  return (
    '<svg class="cook-art" data-cook-art viewBox="0 0 600 300" aria-hidden="true">' +
    gradients +
    scenes[kind] +
    marks(kind) +
    '<polyline class="cook-trail" data-cook-trail fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<g class="cook-tool" data-cook-tool><circle class="cook-grip" r="13"/><g data-cook-tool-body>' +
    tools[kind] +
    '</g></g></svg>'
  );
}

export function paintCookingArtwork(area, activity, held) {
  const { state, kind, ready } = activity;
  const tool = area.querySelector('[data-cook-tool]');
  const x = px(kind === 'heat' ? (state.heat ?? 0.25) : state.x);
  const y = py(kind === 'heat' ? 0.81 : state.y);
  tool.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
  const tilt =
    held && kind === 'pour' && state.flow
      ? 34
      : held && kind === 'cut'
        ? -12
        : held && ['whisk', 'roll', 'season'].includes(kind)
          ? (state.direction || 1) * 13
          : 0;
  tool.querySelector('[data-cook-tool-body]').setAttribute('transform', 'rotate(' + tilt + ')');
  area.toggleAttribute('data-flow', Boolean(held && state.flow));
  area.toggleAttribute('data-overflow', Boolean(state.overflow));
  area.toggleAttribute('data-ready', ready);
  area.style.setProperty('--cook-amount', state.progress || 0);
  area.style.setProperty('--cook-angle', (state.arc || 0) + 'rad');
  if (kind === 'pour') {
    const stream = area.querySelector('[data-cook-stream]');
    stream.setAttribute(
      'd',
      'M' +
        (x + 60) +
        ' ' +
        (y + 21) +
        ' Q' +
        (x + 65) +
        ' ' +
        py(CUP.rim) +
        ' ' +
        px(CUP.x) +
        ' 214',
    );
    const liquid = area.querySelector('[data-cook-liquid]');
    const fill = (state.fill || 0) * 87;
    liquid.setAttribute('y', String(234 - fill));
    liquid.setAttribute('height', String(fill));
  }
  if (kind === 'flip')
    area
      .querySelector('[data-cook-pan]')
      .setAttribute('transform', 'translate(0 ' + -30 * (state.lift || 0) + ')');
  if (kind === 'pipe') {
    const points = COOKING_POINTS.pipe.slice(0, state.marks?.length || 0).map(point);
    area.querySelector('[data-cook-icing]').setAttribute('points', points.join(' '));
  }
  if (!held) area.querySelector('[data-cook-trail]').removeAttribute('points');
}

export function paintCookingTrail(area, trail) {
  area
    .querySelector('[data-cook-trail]')
    ?.setAttribute('points', trail.map(({ x, y }) => point([x, y])).join(' '));
}
