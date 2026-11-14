export function playerIntentText(value) {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : '';
}

export function playerIntentMessages(value) {
  const text = playerIntentText(value);
  return text ? [{ role: 'user', content: `玩家本次想做或想说的事\n${text}` }] : [];
}
