export function getMappedClass<T extends string>(
  map: Record<T, string>,
  type: T,
  fallback: T
): string {
  return map[type] ?? map[fallback];
}
