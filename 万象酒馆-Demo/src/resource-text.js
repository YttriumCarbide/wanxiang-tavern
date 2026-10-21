/** Display vocabulary only; persisted hp/mp fields and authored names stay unchanged. */
export function resourceText(value) {
  return String(value ?? '')
    .replace(/生命(?:值|量)?|血量|(?<![a-z])HP(?![a-z])/giu, 'hp')
    .replace(/法力(?:值|量)?|魔力(?:值|量)?|魔法值|蓝量|(?<![a-z])(?:MP|SP)(?![a-z])/giu, 'sp')
    .replace(/回血/gu, '回复hp')
    .replace(/回蓝/gu, '回复sp');
}
