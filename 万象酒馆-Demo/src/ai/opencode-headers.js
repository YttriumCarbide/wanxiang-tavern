/** Protocol metadata only. Conversation identity persists; each HTTP request gets a fresh ID. */
export function opencodeHeaders(profile, browser = typeof window !== 'undefined') {
  if (new URL(profile.baseUrl).hostname !== 'opencode.ai') return {};
  const saved = profile.sessionId || crypto.randomUUID();
  const session = saved.startsWith('ses_') ? saved : `ses_${saved.replaceAll('-', '')}`;
  return {
    'x-opencode-session': session,
    'x-opencode-request': `msg_${crypto.randomUUID().replaceAll('-', '')}`,
    'x-opencode-client': 'cli',
    ...(!browser ? { 'User-Agent': 'wanxiang-tavern/1.0' } : {}),
  };
}
