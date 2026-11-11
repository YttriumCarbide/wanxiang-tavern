import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { ANTI_ROUTE_VERSION } from '../ai/anti-route.js';

const verdicts = Object.freeze({
  same: '名称一致',
  diff: '名称不同',
  thin: '思考为零',
  skip: '按范围跳过',
  echo: '渠道回显',
  empty: '无正文',
  truncated: '长度截断',
  refusal: '生成受阻',
  unknown: '未知',
});

export function createAntiRoutePanel({ events, apiClient }) {
  const root = document.querySelector('[data-ai-page="anti-route"]');
  const field = (id) => root.querySelector('#route-' + id);
  const switches = [
    ['enabled', '启用请求防护', '控制参数固定、混淆、思考补齐及失败重试；关闭后仍可单独记录响应。'],
    ['verify', '记录与模型名核对', '读取接口回报的模型名和思考用量，不阻止正文显示。'],
    ['safe', '仅观察模式', '保留响应记录；本功能不修改请求、不修复回复、不自动重试。'],
    ['pin', '关闭备用路由', '关闭接口支持的 fallback；OpenRouter 使用 provider.allow_fallbacks。'],
    ['thinking', '缺省思考档位补 high', '保留预设显式指定的 auto、none、low 等档位。'],
    ['retryEmpty', '429 / 204 重试一次', '使用相同的请求，可能额外消耗额度。'],
    [
      'retryOutput',
      '确认无正文时重试一次',
      '仅重试已正常结束、没有正文的回复。与 429 / 204 共用一次重试机会。',
    ],
    ['entropy', '输入混淆（实验）', '折射只改动发送副本中的普通说明段落；不会用来判断模型身份。'],
    ['healTags', '非流式标签闭合修复', '修复未闭合的思考标签；不修改流式回复，保留原始返回。'],
  ];
  const choices = [
    [
      'entropyMode',
      '混淆形式',
      [
        ['refract', '8.31 折射'],
        ['comment', '旧版 · HTML 注释'],
        ['ref', '旧版 · Markdown 引用'],
        ['session', '旧版 · 会话引用'],
      ],
    ],
    [
      'entropyStrength',
      '混淆强度',
      [
        ['light', '轻'],
        ['mid', '中'],
        ['heavy', '重（仅旧版形式）'],
      ],
    ],
    [
      'refractMode',
      '折射种子',
      [
        ['stable', '时窗内稳定'],
        ['random', '每次随机'],
      ],
    ],
    [
      'know',
      '防全知 · 对话与剧本',
      [
        ['off', '关闭'],
        ['lite', '轻'],
        ['full', '完整'],
      ],
    ],
    [
      'charm',
      '去媚 · 对话与剧本',
      [
        ['off', '关闭'],
        ['lite', '轻'],
        ['full', '完整'],
      ],
    ],
    [
      'scope',
      '模型名检测范围',
      [
        ['all', '全部'],
        ['skip', '跳过列表'],
        ['only', '仅检测列表'],
      ],
    ],
  ];
  root.innerHTML = html` <section class="route-settings">
    <small>卢克之光 V0.5 · ANTI-ROUTE ${ANTI_ROUTE_VERSION}</small>
    <div class="route-attribution">
      <span>原作者：凯撒王</span>
      <a
        href="https://discord.com/channels/1134557553011998840/1566099901245432009"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="在 Discord 查看凯撒王的防路由插件发布帖"
        title="Discord · 原作发布帖"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path
            d="M19.7 5.1a18 18 0 0 0-4.4-1.4l-.6 1.2a16.6 16.6 0 0 0-5.4 0l-.6-1.2a18 18 0 0 0-4.4 1.4C1.5 9.2.7 13.2 1.1 17.2a18 18 0 0 0 5.5 2.8l1.1-1.8-1.7-.8.4-.3a13.8 13.8 0 0 0 11.2 0l.4.3-1.7.8 1.1 1.8a18 18 0 0 0 5.5-2.8c.5-4.6-.8-8.6-3.2-12.1ZM8.5 14.8c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.8 2-1.7 2Zm7 0c-1 0-1.7-.9-1.7-2s.7-2 1.7-2 1.7.9 1.7 2-.7 2-1.7 2Z"
          />
        </svg>
      </a>
    </div>
    <h3>请求防护与诊断</h3>
    <p class="ai-hint">
      适用于各用途的 OpenAI 兼容和 Vertex
      原生请求。模型名称及思考用量来自接口回报，不能保证谷歌或中转不换模型；别名与具体版本名也可能不同。
    </p>
    <div class="route-switches">
      ${switches
        .map(
          ([id, label, hint]) =>
            html` <label
              ><span><strong>${label}</strong><small>${hint}</small></span>
              <input id="route-${id}" type="checkbox" role="switch"
            /></label>`,
        )
        .join('')}
    </div>
    <div class="route-options">
      ${choices
        .map(
          ([id, label, options]) =>
            html` <label
              >${label}<select id="route-${id}">
                ${options.map(([value, name]) => html`<option value="${value}">${name}</option>`).join('')}
              </select></label
            >`,
        )
        .join('')}
      <label>模型名关键词（用空格或逗号分开）<input id="route-scopeList" maxlength="512" /></label>
      <label
        >折射时窗（分钟，0 表示不轮换）<input
          id="route-saltWin"
          type="number"
          min="0"
          max="1440"
          step="1"
      /></label>
      <label>额外折射种子（选填）<input id="route-refractSeed" maxlength="120" /></label>
    </div>
    <div class="ai-actions">
      <button id="route-save">保存防护设置</button><button id="route-refresh">刷新记录</button
      ><button id="route-clear">清空记录</button>
    </div>
    <p id="route-status" role="status" aria-live="polite"></p>
    <section class="route-probes">
      <h3>连接探针</h3>
      <p class="ai-hint">
        使用所选用途已保存的地址、模型和密钥。探针会产生额外请求；档位对照会重发最近一次完整输入两次，不写入聊天或游戏进度。
      </p>
      <label
        >连接用途<select id="route-kind">
          <option value="character">角色生成</option>
          <option value="script">剧本</option>
          <option value="chat">酒馆交流</option>
          <option value="quick-chat">快速闲聊</option>
          <option value="summary">记忆总结</option>
          <option value="map">地图</option>
          <option value="creation">以太造物</option>
        </select></label
      >
      <label class="route-alias-input"
        >候选模型 ID（最多 4 个，用空格或逗号分开）<input id="route-aliases" maxlength="484"
      /></label>
      <div class="ai-actions">
        <button data-route-probe="native">原生探针 · 1 次</button
        ><button data-route-probe="dual">模型名校验 · 2 次</button
        ><button data-route-probe="aliases">探测候选模型</button
        ><button data-route-probe="effort">档位对照 · 2 次完整请求</button
        ><button id="route-cancel" hidden>终止探针</button>
      </div>
      <p id="route-probe-result" role="status"></p>
    </section>
    <h3>最近 60 次响应</h3>
    <p class="ai-hint">
      记录仅保留在当前会话，不写入存档和备份；统计为观察值，不能用于确认模型身份。
    </p>
    <p id="route-summary"></p>
    <div class="route-table-wrap">
      <table class="route-table">
        <thead>
          <tr>
            <th>时间 / 用途</th>
            <th>请求 → 回报模型</th>
            <th>判定</th>
            <th>档位</th>
            <th>思考 TK / 字符</th>
            <th>正文 / 耗时</th>
            <th>详情</th>
          </tr>
        </thead>
        <tbody id="route-records"></tbody>
      </table>
    </div>
    <label
      >响应详情（最多 4000 字符）<textarea
        id="route-raw"
        rows="6"
        readonly
        spellcheck="false"
      ></textarea>
    </label>
    <div class="ai-actions">
      <button id="route-copy">复制响应详情</button>
      <button id="route-copy-summary">复制简报（不含原文）</button>
    </div>
  </section>`;
  let records = [];
  let controller = null;
  let disposed = false;
  const status = (text) => {
    if (!disposed) field('status').textContent = text;
  };
  function render(response) {
    for (const [id] of switches) field(id).checked = response.config[id];
    for (const id of [...choices.map(([id]) => id), 'scopeList', 'saltWin', 'refractSeed'])
      field(id).value = response.config[id];
    records = response.records;
    const ratio = (enabled) => {
      const group = records.filter(
        (entry) =>
          entry.entropy === enabled &&
          (['same', 'diff'].includes(entry.verdict) ||
            (entry.verdict === 'thin' && entry.respModel)),
      );
      const mismatches = group.filter((entry) => entry.verdict === 'diff').length;
      return group.length ? `${mismatches} / ${group.length}` : '暂无样本';
    };
    field('summary').textContent =
      `回报名称不同：实际应用混淆 ${ratio(true)}；未应用 ${ratio(false)}`;
    field('records').innerHTML =
      records
        .map(
          (entry, index) =>
            html`<tr>
              <td>
                ${escapeText(new Date(entry.at).toLocaleTimeString())}<br />${escapeText(entry.kind)}
              </td>
              <td>${escapeText(entry.reqModel)} → ${escapeText(entry.respModel || '未回报')}</td>
              <td>
                ${escapeText(verdicts[entry.verdict] || (entry.error ? '请求失败' : '未知'))}${entry.retries ? ' · 重试1次' : ''}${entry.healed ? ' · 已修复标签' : ''}
              </td>
              <td>${escapeText(entry.level)}</td>
              <td>${entry.thoughtTokens < 0 ? '—' : entry.thoughtTokens} / ${entry.thought}</td>
              <td>${entry.text} 字 / ${(entry.ms / 1000).toFixed(1)} 秒</td>
              <td><button data-route-record="${index}">查看</button></td>
            </tr>`,
        )
        .reverse()
        .join('') || '<tr><td colspan="7">暂无响应记录</td></tr>';
  }
  async function load(data) {
    const response = await apiClient.request('anti-route', data);
    if (!disposed) render(response);
  }
  const guard = (operation) => async () => {
    try {
      await operation();
    } catch (failure) {
      status(failure.message);
    }
  };
  events.on(
    document.querySelector('[data-ai-tab="anti-route"]'),
    'click',
    guard(() => {
      root.closest('.ai-editor').scrollTop = 0;
      document.querySelector('#ai-dialog').scrollTop = 0;
      return load();
    }),
  );
  events.on(
    field('refresh'),
    'click',
    guard(() => load()),
  );
  events.on(
    field('clear'),
    'click',
    guard(async () => {
      await load({ action: 'clear' });
      field('raw').value = '';
    }),
  );
  events.on(
    field('save'),
    'click',
    guard(async () => {
      const config = Object.fromEntries(switches.map(([id]) => [id, field(id).checked]));
      if (!field('saltWin').reportValidity()) return;
      for (const [id] of choices) config[id] = field(id).value;
      config.scopeList = field('scopeList').value;
      config.saltWin = field('saltWin').valueAsNumber;
      config.refractSeed = field('refractSeed').value;
      await load({ action: 'save', config });
      status('防护设置已保存，之后的请求生效。');
    }),
  );
  events.on(root, 'click', async (event) => {
    const row = event.target.closest('[data-route-record]');
    if (row) {
      const entry = records[Number(row.dataset.routeRecord)];
      field('raw').value = [entry.error, entry.finish && `结束原因：${entry.finish}`, entry.raw]
        .filter(Boolean)
        .join('\n');
    }
    const button = event.target.closest('[data-route-probe]');
    if (!button || controller) return;
    if (
      button.dataset.routeProbe === 'effort' &&
      !globalThis.confirm('将重发最近完整输入两次，消耗两次接口额度。继续档位对照？')
    )
      return;
    controller = new AbortController();
    field('cancel').hidden = false;
    for (const probe of root.querySelectorAll('[data-route-probe]')) probe.disabled = true;
    field('probe-result').textContent = '探针请求中…';
    try {
      const response = await apiClient.request(
        'anti-route',
        {
          action: 'probe',
          type: button.dataset.routeProbe,
          kind: field('kind').value,
          ...(button.dataset.routeProbe === 'aliases' ? { aliases: field('aliases').value } : {}),
        },
        { signal: controller.signal },
      );
      if (!disposed) field('probe-result').textContent = response.text;
    } catch (failure) {
      if (!disposed)
        field('probe-result').textContent = controller.signal.aborted
          ? '探针已终止'
          : failure.message;
    } finally {
      controller = null;
      if (!disposed) {
        field('cancel').hidden = true;
        for (const probe of root.querySelectorAll('[data-route-probe]')) probe.disabled = false;
      }
    }
  });
  events.on(field('cancel'), 'click', () => controller?.abort());
  events.on(document.querySelector('#ai-dialog'), 'close', () => controller?.abort());
  events.on(
    field('copy'),
    'click',
    guard(async () => {
      await navigator.clipboard.writeText(field('raw').value);
      status('响应详情已复制');
    }),
  );
  events.on(
    field('copy-summary'),
    'click',
    guard(async () => {
      const counts = Object.entries(verdicts)
        .map(([id, label]) => `${label} ${records.filter((entry) => entry.verdict === id).length}`)
        .join(' · ');
      await navigator.clipboard.writeText(
        `卢克之光 V0.5 / Anti-Route ${ANTI_ROUTE_VERSION} · 最近 ${records.length} 次\n${field('summary').textContent}\n${counts}`,
      );
      status('诊断简报已复制。');
    }),
  );
  return {
    dispose() {
      disposed = true;
      controller?.abort();
      records = [];
    },
  };
}
