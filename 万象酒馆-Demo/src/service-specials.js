import { DISHES } from './content/dining.js';
import { SERVICE_MENU } from './content/tavern-service.js';

export const SERVICE_SPECIALS = Object.freeze({
  'frost-chowder': 18,
  'jade-mint-tea': 15,
  'fir-roast': 20,
});

export function serviceSpecial(id) {
  if (!Object.hasOwn(SERVICE_SPECIALS, id)) return null;
  const index = SERVICE_MENU.findIndex((item) => item.id === id);
  const item = SERVICE_MENU[index];
  const dish = DISHES[item.artId];
  return { id, index, dish, price: SERVICE_SPECIALS[id] };
}

export function serviceSpecialCapacity(special, inventory) {
  if (!special) return 0;
  return Math.min(
    2,
    ...Object.entries(special.dish.recipe).map(([id, amount]) =>
      Math.floor((inventory[id] || 0) / amount),
    ),
  );
}

export function reserveServiceSpecial(inventory, selection) {
  if (!selection?.id) return null;
  const { id, portions } = selection;
  const special = serviceSpecial(id);
  if (
    !Number.isInteger(portions) ||
    portions < 1 ||
    portions > serviceSpecialCapacity(special, inventory)
  )
    throw Error('招牌菜食材不足，请调整预留份数');
  for (const [key, amount] of Object.entries(special.dish.recipe))
    inventory[key] -= amount * portions;
  return { id, portions, sold: 0, paid: 0 };
}

export function returnServiceSpecialStock(inventory, special) {
  if (!special || special.refunded) return 0;
  const recipe = serviceSpecial(special.id)?.dish.recipe;
  if (!recipe) return 0;
  const remaining = Math.max(0, special.portions - special.sold);
  for (const [key, amount] of Object.entries(recipe))
    inventory[key] = Math.min(9999, (inventory[key] || 0) + amount * remaining);
  special.refunded = true;
  return remaining;
}
