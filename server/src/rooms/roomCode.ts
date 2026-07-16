import {randomBytes as cryptoRandomBytes} from "node:crypto";

const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_CODE_LENGTH = 6;
const MAX_UNBIASED_BYTE = 256 - (256 % ROOM_CODE_ALPHABET.length);

type RandomBytes = (size: number) => Uint8Array;

export function createRoomCode(randomBytes: RandomBytes = cryptoRandomBytes): string {
  let code = "";

  while (code.length < ROOM_CODE_LENGTH) {
    const bytes = randomBytes(ROOM_CODE_LENGTH - code.length);
    if (bytes.length === 0) {
      throw new Error("The random byte source returned no data");
    }

    for (const byte of bytes) {
      if (byte >= MAX_UNBIASED_BYTE) {
        continue;
      }
      code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
      if (code.length === ROOM_CODE_LENGTH) {
        break;
      }
    }
  }

  return code;
}
