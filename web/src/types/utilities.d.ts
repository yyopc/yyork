/**
 * Use this type to overwrite the keys of the first type with the second one.
 * This is mainly useful with custom props type that extends multiple components
 * with the `as` props.
 */
type Overwrite<T, U> = Omit<T, keyof U> & U;

type UnionKeys<T> = T extends T ? keyof T : never;
type StrictUnionHelper<T, TAll> = T extends unknown
  ? T & Partial<Record<Exclude<UnionKeys<TAll>, keyof T>, undefined>>
  : never;
type StrictUnion<T> = StrictUnionHelper<T, T>;

/**
 * Clean up type for better DX
 */
type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};
