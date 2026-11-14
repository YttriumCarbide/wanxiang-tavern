import { DISHES, INGREDIENTS } from './content/dining.js';
import { SERVICE_MENU } from './content/tavern-service.js';

export const SERVICE_SPECIALS = Object.freeze(
  Object.fromEntries(
    SERVICE_MENU.filter((item) => DISHES[item.artId]?.recipe).map((item) => {
      const ingredients = Object.entries(DISHES[item.artId].recipe).reduce(
        (total, [id, count]) => total + INGREDIENTS[id].price * count,
        0,
      );
      return [item.id, Math.max(item.price + 5, Math.ceil(ingredients * 1.28))];
    }),
  ),
);

const milestones = [0, 5, 12, 25, 45, 75, 120, 180, 260, 380, 550, 750, 1000];

export function serviceSpecial(id, growth) {
  if (!Object.hasOwn(SERVICE_SPECIALS, id)) return null;
  const index = SERVICE_MENU.findIndex((item) => item.id === id);
  const item = SERVICE_MENU[index];
  const dish = DISHES[item.artId];
  const sold = growth?.specialties?.[id] || 0;
  const mastery = milestones.findLastIndex((count) => sold >= count);
  return {
    id,
    index,
    dish,
    sold,
    mastery,
    next: milestones[mastery + 1],
    capacity: 2 + Math.floor(mastery / 2),
    price: Math.ceil(SERVICE_SPECIALS[id] * (1 + mastery * 0.04)),
  };
}

export function serviceSpecialCapacity(special, inventory) {
  if (!special) return 0;
  return Math.min(
    special.capacity,
    ...Object.entries(special.dish.recipe).map(([id, amount]) =>
      Math.floor((inventory[id] || 0) / amount),
    ),
  );
}

export function reserveServiceSpecial(inventory, selection, growth) {
  if (!selection?.id) return null;
  const { id, portions } = selection;
  const special = serviceSpecial(id, growth);
  if (
    !Number.isInteger(portions) ||
    portions < 1 ||
    portions > serviceSpecialCapacity(special, inventory)
  )
    throw Error('招牌菜食材不足，请调整预留份数');
  for (const [key, amount] of Object.entries(special.dish.recipe))
    inventory[key] -= amount * portions;
  return { id, portions, price: special.price, sold: 0, paid: 0 };
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
