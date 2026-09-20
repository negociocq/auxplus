/**
 * Polyfill for Node.js 'crypto' module in browser environments.
 * bcryptjs tries to import 'crypto' which Vite externalizes for browser
 * compatibility. This module provides the minimal API bcryptjs needs.
 */

const cryptoPolyfill = {
  randomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      // Fallback for environments without Web Crypto API
      for (let i = 0; i < length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return bytes;
  },
  createHash(_algorithm: string) {
    throw new Error("createHash not supported in browser");
  },
  createHmac(_algorithm: string, _key: string) {
    throw new Error("createHmac not supported in browser");
  },
  createCipheriv(_algorithm: string, _key: string | Buffer, _iv: string | Buffer) {
    throw new Error("createCipheriv not supported in browser");
  },
  createDecipheriv(_algorithm: string, _key: string | Buffer, _iv: string | Buffer) {
    throw new Error("createDecipheriv not supported in browser");
  },
  createSign(_algorithm: string) {
    throw new Error("createSign not supported in browser");
  },
  createVerify(_algorithm: string) {
    throw new Error("createVerify not supported in browser");
  },
  generateKeySync(_type: string, _options?: unknown) {
    throw new Error("generateKeySync not supported in browser");
  },
  createPublicKey(_key: string | Buffer) {
    throw new Error("createPublicKey not supported in browser");
  },
  createPrivateKey(_key: string | Buffer) {
    throw new Error("createPrivateKey not supported in browser");
  },
  createSecretKey(_key: string | Buffer, _encoding?: string) {
    throw new Error("createSecretKey not supported in browser");
  },
};

export default cryptoPolyfill;
export const randomBytes = cryptoPolyfill.randomBytes;
export const createHash = cryptoPolyfill.createHash;
export const createHmac = cryptoPolyfill.createHmac;