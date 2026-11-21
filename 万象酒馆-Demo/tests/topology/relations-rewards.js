import { ITEMS } from '../../src/content/items.js';
import * as gemCatalog from '../../src/content/gems.js';
import * as skillCatalog from '../../src/content/learnable-skills.js';
import * as emblemCatalog from '../../src/emblems.js';
import { EVENT_REWARD_POOL } from '../../src/adventure/rewards.js';

const SOURCE = 'src/adventure/rewards.js:EVENT_REWARD_POOL';
const ALLOWED_FIELDS = [
  'id',
  'weight',
  'gold',
  'ether',
  'items',
  'gems',
  'skillIds',
  'emblemIds',
  'summonContracts',
  'equipmentVouchers',
];

function locationFor(index) {
  return `${SOURCE}[${index}]`;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function readOwn(value, key) {
  try {
    return {
      present: hasOwn(value, key),
      value: value[key],
    };
  } catch {
    return { present: true, value: undefined };
  }
}

function idsFromCatalogValue(value) {
  const ids = [];

  try {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string') ids.push(entry);
        else if (entry && typeof entry === 'object') {
          if (typeof entry.id === 'string') ids.push(entry.id);
          else if (typeof entry.gemId === 'string') ids.push(entry.gemId);
        }
      }
    } else if (value && typeof value === 'object') {
      ids.push(...Object.keys(value));
    }
  } catch {
    return ids;
  }

  return ids;
}

function idsFromModule(module, names) {
  for (const name of names) {
    try {
      const ids = idsFromCatalogValue(module[name]);
      if (ids.length > 0) return ids;
    } catch {
      // Try the next known catalog export.
    }
  }

  return [];
}

function normalizeIds(source) {
  const ids = new Set();

  try {
    if (source instanceof Set || Array.isArray(source)) {
      for (const id of source) {
        if (typeof id === 'string') ids.add(id);
      }
    } else if (source && typeof source === 'object') {
      for (const id of Object.keys(source)) ids.add(id);
    }
  } catch {
    return ids;
  }

  return ids;
}

function isNonemptyId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function auditInterval(entry, field, location, issues) {
  const property = readOwn(entry, field);
  if (!property.present) return { valid: false, positive: false };

  const range = property.value;
  const valid =
    Array.isArray(range) &&
    range.length === 2 &&
    range.every((value) => Number.isSafeInteger(value) && value >= 0) &&
    range[0] <= range[1];

  if (!valid) {
    issues.push({
      code: 'invalid-interval',
      location,
      detail: `${field} must be a [min, max] pair of nonnegative safe integers with min <= max.`,
    });
    return { valid: false, positive: false };
  }

  return { valid: true, positive: range[1] > 0 };
}

function auditCount(entry, field, location, issues) {
  const property = readOwn(entry, field);
  if (!property.present) return { valid: false, positive: false };

  const valid = Number.isSafeInteger(property.value) && property.value >= 0;
  if (!valid) {
    issues.push({
      code: 'invalid-count',
      location,
      detail: `${field} must be a nonnegative safe integer.`,
    });
    return { valid: false, positive: false };
  }

  return { valid: true, positive: property.value > 0 };
}

function auditItems(entry, location, itemIds, issues) {
  const property = readOwn(entry, 'items');
  if (!property.present) return false;

  const items = property.value;
  if (!items || typeof items !== 'object' || Array.isArray(items)) {
    issues.push({
      code: 'invalid-items',
      location,
      detail: 'items must be an object mapping item IDs to counts.',
    });
    return false;
  }

  let positive = false;
  let entries;

  try {
    entries = Object.entries(items);
  } catch {
    issues.push({
      code: 'invalid-items',
      location,
      detail: 'items could not be read as an item-count map.',
    });
    return false;
  }

  for (const [id, count] of entries) {
    if (!itemIds.has(id)) {
      issues.push({
        code: 'unknown-item',
        location,
        detail: `items references unknown item ID "${id}".`,
      });
    }

    if (!Number.isSafeInteger(count) || count <= 0) {
      issues.push({
        code: 'invalid-item-count',
        location,
        detail: `Item "${id}" must have a positive safe-integer count.`,
      });
    } else {
      positive = true;
    }
  }

  return positive;
}

function auditGems(entry, location, gemIds, issues) {
  const property = readOwn(entry, 'gems');
  if (!property.present) return false;

  if (!Array.isArray(property.value)) {
    issues.push({
      code: 'invalid-gems',
      location,
      detail: 'gems must be an array of gem IDs or entries with a gemId.',
    });
    return false;
  }

  let positive = false;

  for (let index = 0; index < property.value.length; index += 1) {
    const gem = property.value[index];
    const gemId =
      typeof gem === 'string'
        ? gem
        : gem && typeof gem === 'object' && !Array.isArray(gem)
          ? readOwn(gem, 'gemId').value
          : undefined;

    if (!isNonemptyId(gemId)) {
      issues.push({
        code: 'invalid-gem-reference',
        location,
        detail: `gems[${index}] must identify a gem with a nonempty gemId.`,
      });
      continue;
    }

    if (gem && typeof gem === 'object' && hasOwn(gem, 'count')) {
      const count = readOwn(gem, 'count').value;
      if (!Number.isSafeInteger(count) || count <= 0) {
        issues.push({
          code: 'invalid-gem-count',
          location,
          detail: `gems[${index}].count must be a positive safe integer.`,
        });
      }
    }
    positive = true;
    if (!gemIds.has(gemId)) {
      issues.push({
        code: 'unknown-gem',
        location,
        detail: `gems[${index}] references unknown gem ID "${gemId}".`,
      });
    }
  }

  return positive;
}

function auditReferenceArray(entry, field, kind, location, knownIds, issues) {
  const property = readOwn(entry, field);
  if (!property.present) return false;

  if (!Array.isArray(property.value)) {
    issues.push({
      code: `invalid-${field.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
      location,
      detail: `${field} must be an array of IDs.`,
    });
    return false;
  }

  let positive = false;

  for (let index = 0; index < property.value.length; index += 1) {
    const id = property.value[index];

    if (!isNonemptyId(id)) {
      issues.push({
        code: `invalid-${kind}-reference`,
        location,
        detail: `${field}[${index}] must be a nonempty ID.`,
      });
      continue;
    }

    positive = true;
    if (!knownIds.has(id)) {
      issues.push({
        code: `unknown-${kind}`,
        location,
        detail: `${field}[${index}] references unknown ${kind} ID "${id}".`,
      });
    }
  }

  return positive;
}

export function auditRewardPool(pool, options = {}) {
  const suppliedOptions = options && typeof options === 'object' ? options : {};
  const itemIds = normalizeIds(suppliedOptions.itemIds);
  const gemIds = normalizeIds(suppliedOptions.gemIds);
  const skillIds = normalizeIds(suppliedOptions.skillIds);
  const emblemIds = normalizeIds(suppliedOptions.emblemIds);
  const issues = [];
  const stats = {
    entryCount: Array.isArray(pool) ? pool.length : 0,
    auditedEntryCount: 0,
    uniqueIdCount: 0,
    rewardCount: 0,
    emptyRewardCount: 0,
    issueCount: 0,
  };

  if (!Array.isArray(pool)) {
    issues.push({
      code: 'invalid-pool',
      location: SOURCE,
      detail: 'The reward pool must be an array.',
    });
    stats.issueCount = issues.length;
    return { issues, stats };
  }

  const seenIds = new Set();

  for (let index = 0; index < pool.length; index += 1) {
    const location = locationFor(index);
    let entry;

    try {
      entry = pool[index];
    } catch {
      issues.push({
        code: 'invalid-entry',
        location,
        detail: 'The reward entry could not be read.',
      });
      continue;
    }

    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({
        code: 'invalid-entry',
        location,
        detail: 'Each reward entry must be an object.',
      });
      continue;
    }

    stats.auditedEntryCount += 1;

    const idProperty = readOwn(entry, 'id');
    const idValid = idProperty.present && isNonemptyId(idProperty.value);

    if (!idValid) {
      issues.push({
        code: 'invalid-id',
        location,
        detail: 'id must be a nonempty string.',
      });
    } else if (seenIds.has(idProperty.value)) {
      issues.push({
        code: 'duplicate-id',
        location,
        detail: `Duplicate reward ID "${idProperty.value}".`,
      });
    } else {
      seenIds.add(idProperty.value);
      stats.uniqueIdCount += 1;
    }

    const weightProperty = readOwn(entry, 'weight');
    const weightValid =
      weightProperty.present && Number.isFinite(weightProperty.value) && weightProperty.value > 0;

    if (!weightValid) {
      issues.push({
        code: 'invalid-weight',
        location,
        detail: 'weight must be a finite positive number.',
      });
    }

    try {
      for (const key of Object.keys(entry)) {
        if (!ALLOWED_FIELDS.includes(key)) {
          issues.push({
            code: 'unknown-reward-field',
            location,
            detail: `The production reward consumer does not support field "${key}".`,
          });
        }
      }
    } catch {
      issues.push({
        code: 'invalid-entry',
        location,
        detail: 'Reward fields could not be read.',
      });
    }

    let hasPositiveGrant = false;

    for (const field of ['gold', 'ether']) {
      try {
        const result = auditInterval(entry, field, location, issues);
        hasPositiveGrant ||= result.positive;
      } catch {
        issues.push({
          code: 'invalid-interval',
          location,
          detail: `${field} must be a valid nonnegative integer interval.`,
        });
      }
    }

    for (const field of ['summonContracts', 'equipmentVouchers']) {
      try {
        const result = auditCount(entry, field, location, issues);
        hasPositiveGrant ||= result.positive;
      } catch {
        issues.push({
          code: 'invalid-count',
          location,
          detail: `${field} must be a nonnegative safe integer.`,
        });
      }
    }

    try {
      hasPositiveGrant = auditItems(entry, location, itemIds, issues) || hasPositiveGrant;
    } catch {
      issues.push({
        code: 'invalid-items',
        location,
        detail: 'items could not be audited.',
      });
    }

    try {
      hasPositiveGrant = auditGems(entry, location, gemIds, issues) || hasPositiveGrant;
    } catch {
      issues.push({
        code: 'invalid-gems',
        location,
        detail: 'gems could not be audited.',
      });
    }

    try {
      hasPositiveGrant =
        auditReferenceArray(entry, 'skillIds', 'skill', location, skillIds, issues) ||
        hasPositiveGrant;
    } catch {
      issues.push({
        code: 'invalid-skill-ids',
        location,
        detail: 'skillIds could not be audited.',
      });
    }

    try {
      hasPositiveGrant =
        auditReferenceArray(entry, 'emblemIds', 'emblem', location, emblemIds, issues) ||
        hasPositiveGrant;
    } catch {
      issues.push({
        code: 'invalid-emblem-ids',
        location,
        detail: 'emblemIds could not be audited.',
      });
    }

    if (hasPositiveGrant) {
      stats.rewardCount += 1;
    } else if (idValid && weightValid) {
      stats.emptyRewardCount += 1;
      issues.push({
        code: 'empty-reward',
        location,
        detail: 'A reward entry with an ID and weight must grant at least one positive reward.',
      });
    }
  }

  stats.issueCount = issues.length;
  return { issues, stats };
}

export function auditEventRewardConsumer(pool) {
  const issues = [];
  if (!Array.isArray(pool)) return issues;

  const positiveCount = (value) => Number.isSafeInteger(value) && value > 0;

  for (let index = 0; index < pool.length; index += 1) {
    let entry;
    try {
      entry = pool[index];
    } catch {
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;

    const location = locationFor(index);
    for (const field of ['gems', 'skillIds', 'emblemIds', 'equipmentVouchers']) {
      let present;
      try {
        present = hasOwn(entry, field);
      } catch {
        continue;
      }
      if (present) {
        issues.push({
          code: 'unsupported-consumer-field',
          location,
          detail: `rollEventReward does not grant ${field}.`,
        });
      }
    }

    let positive = positiveCount(readOwn(entry, 'summonContracts').value);
    for (const field of ['gold', 'ether']) {
      if (positive) break;
      try {
        positive = auditInterval(entry, field, location, []).positive;
      } catch {
        // The generic audit reports malformed intervals.
      }
    }

    if (!positive) {
      const items = readOwn(entry, 'items').value;
      if (items && typeof items === 'object' && !Array.isArray(items)) {
        try {
          positive = Object.keys(items).some((id) => positiveCount(readOwn(items, id).value));
        } catch {
          // The generic audit reports unreadable item maps.
        }
      }
    }

    if (!positive) {
      issues.push({
        code: 'consumer-empty-reward',
        location,
        detail:
          'rollEventReward cannot grant positive gold, ether, summon contracts, or item counts from this entry.',
      });
    }
  }
  return issues;
}

export function auditEventRewards() {
  const result = auditRewardPool(EVENT_REWARD_POOL, {
    itemIds: Object.keys(ITEMS),
    gemIds: idsFromModule(gemCatalog, ['GEM_POOL']),
    skillIds: idsFromModule(skillCatalog, [
      'LEARNABLE_SKILLS',
      'SKILLS',
      'LEARNABLE_SKILL_CATALOG',
    ]),
    emblemIds: idsFromModule(emblemCatalog, ['EMBLEMS', 'EMBLEM_CATALOG']),
  });
  const issues = [...result.issues, ...auditEventRewardConsumer(EVENT_REWARD_POOL)];
  return { issues, stats: { ...result.stats, issueCount: issues.length } };
}
