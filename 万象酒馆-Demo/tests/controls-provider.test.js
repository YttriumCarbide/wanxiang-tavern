import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUEST_TIMEOUT_MS } from '../src/ai/request-policy.js';
import { compatibleRequest, completionURL } from '../src/ai/compatible.js';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { newCampaign, assignParty } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { restoreLibrary } from '../src/ai/library.js';
import { rearUnlocked } from '../src/formation-access.js';
import { recordSettlement, pandoraEligible, joinPandora } from '../src/companion-events.js';
import { opencodeHeaders } from '../src/ai/opencode-headers.js';

test('15-minute timeout and OpenCode session header use the common compatible transport, Cline keeps its endpoint', async () => {
  assert.equal(REQUEST_TIMEOUT_MS, 900000);
  const store = createConnectionStore();
  await store.saveProfile({
    kind: 'chat',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    model: 'fixture',
    apiKey: 'fixture-key',
    tokenField: 'max_tokens',
  });
  let captured;
  await compatibleRequest(store.get('chat'), [{ role: 'user', content: 'hello' }], {
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return Response.json({ choices: [{ message: { content: 'OK' } }] });
    },
  });
  assert.equal(captured.url, 'https://opencode.ai/zen/go/v1/chat/completions');
  assert(captured.options.headers['x-opencode-session']);
  assert.equal(captured.options.headers['User-Agent'], 'wanxiang-tavern/1.0');
  assert.equal(captured.options.headers['x-opencode-client'], 'cli');
  const next = opencodeHeaders(store.get('chat'));
  assert.equal(next['x-opencode-session'], captured.options.headers['x-opencode-session']);
  assert.notEqual(next['x-opencode-request'], captured.options.headers['x-opencode-request']);
  assert.match(next['x-opencode-request'], /^msg_[a-z0-9]+$/);
  assert.match(next['x-opencode-session'], /^ses_[a-z0-9]+$/);
  assert.equal(opencodeHeaders(store.get('chat'), true)['User-Agent'], undefined);
  assert.deepEqual(opencodeHeaders({ baseUrl: 'https://other.invalid/v1' }), {});
  assert.equal(
    completionURL('https://api.cline.bot/api/v1').href,
    'https://api.cline.bot/api/v1/chat/completions',
  );
});

test('rear is locked and hidden by the same access rule until Pandora joins after two completed trips', () => {
  const library = newCampaign(defaultProtagonist());
  assert(!rearUnlocked(library));
  assert.throws(() => assignParty(library, 3, library.party[0]), /潘多拉/);
  recordSettlement(library, 'first');
  assert(!pandoraEligible(library));
  recordSettlement(library, 'first');
  assert(!pandoraEligible(library));
  recordSettlement(library, 'second');
  assert(joinPandora(library));
  assert(rearUnlocked(library));
  assignParty(library, 3, library.party[0]);
  const restored = restoreLibrary(library);
  assert.equal(restored.party[3], library.campaign.protagonistId);
  assert.equal(restored.progression.entryLesson, 'pending');
  assert(!joinPandora(library));
});
