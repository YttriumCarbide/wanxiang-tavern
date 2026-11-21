import { parseGalText } from '../gal.js';

export const actHistory = (current) =>
  (current?.history || [])
    .filter((item) => item.index === current.index)
    .map(({ role, content }) => ({ role, content }));

export function createOverlandWorkspace({
  context,
  owner,
  run,
  stage,
  partyIds,
  render,
  activeRpRequest,
  isReading,
}) {
  const stagePanel = document.querySelector('#gal-stage');
  const form = document.createElement('form');
  form.id = 'overland-rp';
  form.hidden = true;
  form.innerHTML = `<header class="invite-meta">
    <span class="invite-progress" aria-live="polite"></span>
    <div class="invite-actions"><button type="button" data-overland-continue></button></div></header>
    <div class="invite-choices" aria-label="本幕建议行动" hidden></div>
    <div class="invite-reply">
      <textarea id="overland-input" rows="3" maxlength="3000" required
        aria-label="旅途回应" placeholder="你想怎么应对眼前的旅途奇遇？"></textarea>
      <button id="overland-send" type="submit" aria-label="回应">回应</button>
    </div>
    <p class="invite-error" role="status"></p>`;
  const field = form.querySelector('textarea');
  const choices = form.querySelector('.invite-choices');
  const notice = form.querySelector('.invite-error');
  let workspace = false;

  function sceneDialogue(current) {
    const act = current?.acts?.[current.index];
    if (!act || current.phase === 'depart' || (current.phase === 'intro' && isReading())) return [];
    const dialogue = parseGalText(act.story);
    const history = actHistory(current);
    for (const [index, message] of history.entries()) {
      if (message.role === 'user') dialogue.push({ speaker: '玩家', text: message.content });
      else if (!isReading() || index !== history.length - 1)
        dialogue.push(...parseGalText(message.content));
    }
    return dialogue;
  }

  function updateForm() {
    const current = run();
    if (!current || form.hidden) return;
    const act = current.acts[current.index];
    const turns = Math.floor(actHistory(current).length / 2);
    const last = current.index + 1 === current.acts.length;
    form.querySelector('.invite-progress').textContent =
      `第 ${current.index + 1}/${current.acts.length} 幕 · ${stage(current).to.name} · ${act.title}${turns ? ` · 已互动 ${turns} 轮` : ''}`;
    const cont = form.querySelector('[data-overland-continue]');
    cont.textContent = last ? '抵达终点 →' : '继续赶路 →';
    const hasLegacyOutcomes = Boolean(act.choices?.some((item) => item.outcome));
    const locked = Boolean(
      activeRpRequest() || isReading() || current.phase !== 'choice' || hasLegacyOutcomes,
    );
    field.disabled = locked;
    form.querySelector('[type="submit"]').disabled = locked;
    cont.disabled = Boolean(activeRpRequest() || isReading() || current.phase !== 'choice');
    const available = !locked && !turns ? act.choices || [] : [];
    choices.hidden = !available.length;
    choices.replaceChildren(
      ...available.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.overlandChoice = item.id || '';
        button.textContent = item.label;
        return button;
      }),
    );
  }

  function openWorkspace(current) {
    if (workspace || run() !== current) return;
    workspace = true;
    form.hidden = false;
    field.value = current.draft || '';
    notice.textContent = '';
    context.gal.workspace({
      owner,
      title: current.acts[current.index].title,
      actors: partyIds(),
      followSpeakers: true,
      composer: [form],
      onLayout({ height }) {
        stagePanel?.style.setProperty('--daily-invite-composer', `${height}px`);
      },
      transcript: () => sceneDialogue(current),
      onClose() {
        stagePanel?.style.removeProperty('--daily-invite-composer');
        workspace = false;
        form.hidden = true;
        form.remove();
        activeRpRequest()?.abort();
        render();
      },
    });
    updateForm();
  }
  return { form, field, notice, updateForm, openWorkspace };
}
