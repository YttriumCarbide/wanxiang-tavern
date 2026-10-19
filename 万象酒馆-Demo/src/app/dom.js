export const query = (selector) => document.querySelector(selector);
export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
