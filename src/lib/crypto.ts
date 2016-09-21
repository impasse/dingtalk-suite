import { createCipheriv, createDecipheriv, createHash, pseudoRandomBytes } from 'crypto'

type Bytes = string | Buffer;

class PKCS7Encoder {
  static decode(text: Bytes): Bytes {
    let pad = text[text.length - 1];
    if (pad < 1 || pad > 32) {
      pad = 0;
    }
    return text.slice(0, text.length - (pad as number));
  }

  static encode(text: Bytes): Buffer {
    const blockSize = 32;
    const textLength = text.length;
    const amountToPad = blockSize - (textLength % blockSize);
    const result = Buffer.alloc(amountToPad);
    result.fill(amountToPad);
    return Buffer.concat([text as Buffer, result]);
  }
}

export default class DingTalkCrypt {
  private key: Buffer
  private iv: Buffer

  constructor(private token: string, private encodingAESKey: string, private id: string) {
    const AESKey = Buffer.from(encodingAESKey + '=', 'base64');
    if (AESKey.length !== 32) {
      throw new Error('encodingAESKey invalid');
    }
    this.key = AESKey;
    this.iv = AESKey.slice(0, 16);
  }

  getSignature(...args: Array<string>): string {
    return createHash('sha1')
      .update(
      args
        .concat(this.token)
        .sort()
        .join('')
      )
      .digest('hex');
  }

  decrypt(text: string): { message: string, id: string } {
    const decipher = createDecipheriv('aes-256-cbc', this.key, this.iv);
    decipher.setAutoPadding(false);
    let deciphered: any = Buffer.concat([decipher.update(text, 'base64' as any), decipher.final()]);

    deciphered = PKCS7Encoder.decode(deciphered);

    const content = deciphered.slice(16);
    const length = content.slice(0, 4).readUInt32BE(0);

    return {
      message: content.slice(4, length + 4).toString(),
      id: content.slice(length + 4).toString()
    };
  }

  encrypt(text: string) {
    const randomString = pseudoRandomBytes(16);
    const msg = Buffer.from(text);

    const msgLength = Buffer.alloc(4);
    msgLength.writeUInt32BE(msg.length, 0);

    const id = Buffer.from(this.id);

    const bufMsg = Buffer.concat([randomString, msgLength, msg, id]);

    const encoded = PKCS7Encoder.encode(bufMsg);

    const cipher = createCipheriv('aes-256-cbc', this.key, this.iv);
    cipher.setAutoPadding(false);

    const cipherMsg = Buffer.concat([cipher.update(encoded), cipher.final()]);

    return cipherMsg.toString('base64');
  }
}
