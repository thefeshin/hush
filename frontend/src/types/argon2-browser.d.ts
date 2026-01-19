/**
 * Type declarations for argon2-browser
 */

declare module 'argon2-browser' {
  export enum ArgonType {
    Argon2d = 0,
    Argon2i = 1,
    Argon2id = 2
  }

  export interface Argon2Options {
    pass: string | Uint8Array;
    salt: string | Uint8Array;
    type: ArgonType | number;
    mem: number;
    time: number;
    parallelism: number;
    hashLen: number;
  }

  export interface Argon2Result {
    hash: Uint8Array;
    hashHex: string;
    encoded: string;
  }

  export function hash(options: Argon2Options): Promise<Argon2Result>;

  const argon2: {
    ArgonType: typeof ArgonType;
    hash: typeof hash;
  };

  export default argon2;
}
