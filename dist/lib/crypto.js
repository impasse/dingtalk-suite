"use strict";
const crypto_1 = require('crypto');
class PKCS7Encoder {
    static decode(text) {
        let pad = +text[text.length - 1];
        if (pad < 1 || pad > 32) {
            pad = 0;
        }
        return Buffer.from(text.slice(0, text.length - pad));
    }
    static encode(text) {
        const blockSize = 32;
        const textLength = text.length;
        const amountToPad = blockSize - (textLength % blockSize);
        const result = Buffer.alloc(amountToPad);
        result.fill(amountToPad);
        return Buffer.concat([text, result]);
    }
}
class DingTalkCrypt {
    constructor(token, encodingAESKey, id) {
        this.token = token;
        this.encodingAESKey = encodingAESKey;
        this.id = id;
        const AESKey = Buffer.from(encodingAESKey + '=', 'base64');
        if (AESKey.length !== 32) {
            throw new Error('encodingAESKey invalid');
        }
        this.key = AESKey;
        this.iv = AESKey.slice(0, 16);
    }
    getSignature(...args) {
        return crypto_1.createHash('sha1')
            .update(args
            .concat(this.token)
            .sort()
            .join(''))
            .digest('hex');
    }
    decrypt(text) {
        const decipher = crypto_1.createCipheriv('aes-256-cbc', this.key, this.iv);
        decipher.setAutoPadding(false);
        let deciphered = Buffer.concat([decipher.update(text, 'base64'), decipher.final()]);
        deciphered = PKCS7Encoder.decode(deciphered);
        const content = deciphered.slice(16);
        const length = content.slice(0, 4).readUInt32BE(0);
        return {
            message: content.slice(4, length + 4).toString(),
            id: content.slice(length + 4).toString()
        };
    }
    encrypt(text) {
        const randomString = crypto_1.pseudoRandomBytes(16);
        const msg = Buffer.from(text);
        const msgLength = Buffer.alloc(4);
        msgLength.writeUInt32BE(msg.length, 0);
        const id = Buffer.from(this.id);
        const bufMsg = Buffer.concat([randomString, msgLength, msg, id]);
        const encoded = PKCS7Encoder.encode(bufMsg);
        const cipher = crypto_1.createCipheriv('aes-256-cbc', this.key, this.iv);
        cipher.setAutoPadding(false);
        const cipherMsg = Buffer.concat([cipher.update(encoded), cipher.final()]);
        return cipherMsg.toString('base64');
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DingTalkCrypt;
