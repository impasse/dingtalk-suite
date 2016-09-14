"use strict";
const crypto_1 = require('./crypto');
require('./common');
function default_1(config, callback) {
    const dingCrypt = new crypto_1.default(config.token, config.encodingAESKey, config.suiteid || 'suite4xxxxxxxxxxxxxxx');
    const ticketExpiresIn = config.ticketExpiresIn || 1000 * 60 * 20;
    function genResponse(timestamp, nonce, text) {
        const encrypt = dingCrypt.encrypt(text);
        const msg_signature = dingCrypt.getSignature(timestamp, nonce, encrypt);
        return {
            msg_signature: msg_signature,
            encrypt: encrypt,
            timeStamp: timestamp,
            nonce: nonce
        };
    }
    return function (req, res, next) {
        const { signature, timestamp, nonce } = req.query;
        const encrypt = req.body.encrypt;
        if (signature !== dingCrypt.getSignature(timestamp, nonce, encrypt)) {
            return res.status(401).end('Invalid signature');
        }
        let result = dingCrypt.decrypt(encrypt);
        const message = JSON.parse(result.message);
        if (message.EventType === 'check_update_suite_url' || message.EventType === 'check_create_suite_url') {
            const Random = message.Random;
            res.json(genResponse(timestamp, nonce, Random));
        }
        else {
            res.reply = function () {
                res.json(genResponse(timestamp, nonce, 'success'));
            };
            if (config.saveTicket && message.EventType === 'suite_ticket') {
                const data = {
                    value: message.SuiteTicket,
                    expires: Number(message.TimeStamp) + ticketExpiresIn
                };
                config.saveTicket(data);
                res.reply();
            }
            else {
                callback(message, req, res, next);
            }
        }
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
