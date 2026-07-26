declare module "bun:test" {
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export const mock: {
    module(name: string, factory: () => Record<string, unknown>): void;
  };
  type Matchers<T> = {
    readonly not: Matchers<T>;
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toBeDefined(): void;
    toBeGreaterThan(expected: number): void;
    toContain(expected: unknown): void;
  };
  export function expect<T>(value: T): Matchers<T>;
}
