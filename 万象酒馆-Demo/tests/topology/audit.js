import { auditSource } from './source.js';
import { auditRelations } from './relations.js';
import { auditEventRewards } from './relations-rewards.js';
import { auditGuild } from './relations-guild.js';
import { auditRoutes } from './routes.js';
import { auditAssets } from './assets.js';

export function findingKey(issue) {
  return JSON.stringify([issue.area, issue.code, issue.location, issue.detail]);
}

export async function auditRepository() {
  const results = await Promise.all([
    auditSource(),
    auditRelations(),
    auditEventRewards(),
    auditGuild(),
    auditRoutes(),
    auditAssets(),
  ]);
  const areas = ['source', 'relations', 'rewards', 'guild', 'routes', 'assets'];
  const sections = Object.fromEntries(areas.map((area, index) => [area, results[index]]));
  const issues = results.flatMap((result, index) =>
    result.issues.map((issue) => ({ area: areas[index], ...issue })),
  );
  issues.sort((left, right) => {
    const a = findingKey(left);
    const b = findingKey(right);
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return { schemaVersion: 1, issues, sections };
}
