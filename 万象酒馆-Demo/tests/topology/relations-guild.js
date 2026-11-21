import { GUILD_RANKS, GUILD_BOUNTIES, GUILD_SUPPLIES, GUILD_TRIALS } from '../../src/guild.js';
import { ENEMIES, BOSSES } from '../../src/data.js';
import { ITEMS } from '../../src/content/items.js';
import { REGIONS } from '../../src/content/regions.js';
import { IMPERIAL_DUNGEONS } from '../../src/content/imperial-network.js';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function catalogKeys(catalog) {
  if (Array.isArray(catalog)) {
    return catalog.map((entry) => entry?.id).filter(isId);
  }
  return isRecord(catalog) ? Object.keys(catalog) : [];
}

function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function compareIssues(left, right) {
  for (const key of ['code', 'location', 'detail']) {
    if (left[key] < right[key]) return -1;
    if (left[key] > right[key]) return 1;
  }
  return 0;
}

export function auditGuildData(overrides = {}) {
  const {
    GUILD_RANKS: ranks = GUILD_RANKS,
    GUILD_BOUNTIES: bounties = GUILD_BOUNTIES,
    GUILD_SUPPLIES: supplies = GUILD_SUPPLIES,
    GUILD_TRIALS: trials = GUILD_TRIALS,
    ENEMIES: enemies = ENEMIES,
    BOSSES: bosses = BOSSES,
    ITEMS: items = ITEMS,
    REGIONS: regions = REGIONS,
    IMPERIAL_DUNGEONS: imperialDungeons = IMPERIAL_DUNGEONS,
  } = overrides;

  const issues = [];
  const itemIds = new Set(catalogKeys(items));
  const enemyIds = new Set([...catalogKeys(enemies), ...catalogKeys(bosses)]);
  const mapIds = new Set(catalogKeys(regions));
  if (Array.isArray(imperialDungeons)) {
    for (const dungeon of imperialDungeons) {
      if (isId(dungeon?.id)) mapIds.add(dungeon.id);
    }
  }

  function report(code, location, detail) {
    issues.push({ code, location, detail });
  }

  function auditRows(rows, name, idField, visit) {
    const source = `src/guild.js:${name}`;
    const seen = new Set();
    if (!Array.isArray(rows)) {
      report('invalid-collection', source, `${name} must be an array.`);
      return seen;
    }

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const location = `${source}[${index}]`;
      if (!isRecord(row)) {
        report('invalid-entry', location, 'An entry must be an object.');
        continue;
      }
      const id = row[idField];
      const idLocation = `${location}.${idField}`;
      if (!isId(id)) {
        report(`invalid-${idField}`, idLocation, `${idField} must be a nonempty string.`);
      } else if (seen.has(id)) {
        report(`duplicate-${idField}`, idLocation, `Duplicate ${idField} ${JSON.stringify(id)}.`);
      } else {
        seen.add(id);
      }
      visit(row, location);
    }
    return seen;
  }

  function auditReference(value, knownIds, kind, location) {
    if (!isId(value)) {
      report(`unknown-${kind}`, location, `Expected a known ${kind} ID.`);
    } else if (!knownIds.has(value)) {
      report(`unknown-${kind}`, location, `Unknown ${kind} ID ${JSON.stringify(value)}.`);
    }
  }

  function auditMaps(row, location) {
    for (const field of ['map', 'mapId', 'targetMap', 'targetMapId']) {
      if (Object.hasOwn(row, field)) {
        auditReference(row[field], mapIds, 'map', `${location}.${field}`);
      }
    }
    if (!Object.hasOwn(row, 'targetMaps')) return;
    const { targetMaps } = row;
    const fieldLocation = `${location}.targetMaps`;
    if (!Array.isArray(targetMaps)) {
      report('invalid-target-maps', fieldLocation, 'targetMaps must be an array of map IDs.');
      return;
    }
    for (let index = 0; index < targetMaps.length; index += 1) {
      auditReference(targetMaps[index], mapIds, 'map', `${fieldLocation}[${index}]`);
    }
  }

  function auditLevel(level, location) {
    if (!Number.isFinite(level) || level <= 0) {
      report('invalid-number', `${location}.level`, 'level must be a finite positive number.');
    }
  }

  function auditRewards(row, fields, location) {
    let positive = false;
    for (const field of fields) {
      const value = row[field];
      if (!nonnegativeInteger(value)) {
        report('invalid-number', `${location}.${field}`, `${field} must be a nonnegative integer.`);
      } else if (value > 0) {
        positive = true;
      }
    }
    if (!positive) {
      report('empty-reward', location, `At least one of ${fields.join(', ')} must be positive.`);
    }
  }

  let previousMerit = -1;
  const rankIds = auditRows(ranks, 'GUILD_RANKS', 'rank', (row, location) => {
    const { minMerit, discount, bonusPct } = row;
    if (!Number.isFinite(minMerit) || minMerit < 0 || minMerit <= previousMerit) {
      report(
        'invalid-number',
        `${location}.minMerit`,
        'minMerit must be finite, nonnegative, and strictly increasing.',
      );
    } else {
      previousMerit = minMerit;
    }
    if (!Number.isFinite(discount) || discount < 0 || discount > 1) {
      report(
        'invalid-number',
        `${location}.discount`,
        'discount must be between 0 and 1 inclusive.',
      );
    }
    if (!Number.isFinite(bonusPct) || bonusPct < 0) {
      report('invalid-number', `${location}.bonusPct`, 'bonusPct must be finite and nonnegative.');
    }
  });

  auditRows(bounties, 'GUILD_BOUNTIES', 'id', (row, location) => {
    auditReference(row.rank, rankIds, 'rank', `${location}.rank`);
    if (row.targetKind !== 'dungeon' && row.targetKind !== 'any-road') {
      report(
        'invalid-target-kind',
        `${location}.targetKind`,
        'targetKind must be dungeon or any-road.',
      );
    }
    auditMaps(row, location);
    if (
      row.targetKind === 'dungeon' &&
      (!Array.isArray(row.targetMaps) || !row.targetMaps.length)
    ) {
      report(
        'invalid-target-maps',
        `${location}.targetMaps`,
        'Dungeon bounties require a nonempty map list.',
      );
    }
    if (!Number.isSafeInteger(row.targetCount) || row.targetCount <= 0) {
      report(
        'invalid-quantity',
        `${location}.targetCount`,
        'targetCount must be a positive integer.',
      );
    }
    auditLevel(row.level, location);
    auditRewards(row, ['gold', 'ether', 'merit'], location);
  });

  auditRows(supplies, 'GUILD_SUPPLIES', 'id', (row, location) => {
    if (row.kind === 'item') {
      auditReference(row.itemId, itemIds, 'item', `${location}.itemId`);
    } else if (row.kind !== 'ether') {
      report('invalid-kind', `${location}.kind`, 'kind must be item or ether.');
    }
    if (!Number.isSafeInteger(row.qty) || row.qty <= 0) {
      report('invalid-quantity', `${location}.qty`, 'qty must be a positive safe integer.');
    }
    if (!Number.isSafeInteger(row.price) || row.price < 0) {
      report('invalid-number', `${location}.price`, 'price must be a nonnegative safe integer.');
    }
  });

  auditRows(trials, 'GUILD_TRIALS', 'id', (row, location) => {
    const fieldLocation = `${location}.enemyIds`;
    if (!Array.isArray(row.enemyIds) || row.enemyIds.length === 0) {
      report('invalid-enemy-ids', fieldLocation, 'enemyIds must be a nonempty array of enemy IDs.');
    } else {
      for (let index = 0; index < row.enemyIds.length; index += 1) {
        auditReference(row.enemyIds[index], enemyIds, 'enemy', `${fieldLocation}[${index}]`);
      }
    }
    auditMaps(row, location);
    auditLevel(row.level, location);
    auditRewards(row, ['gold', 'merit'], location);
  });

  return {
    issues: issues.sort(compareIssues),
    stats: {
      rankCount: Array.isArray(ranks) ? ranks.length : 0,
      bountyCount: Array.isArray(bounties) ? bounties.length : 0,
      supplyCount: Array.isArray(supplies) ? supplies.length : 0,
      trialCount: Array.isArray(trials) ? trials.length : 0,
      issueCount: issues.length,
    },
  };
}

export function auditGuild() {
  return auditGuildData();
}
