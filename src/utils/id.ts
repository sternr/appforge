export function generateId(): string {
  return crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
