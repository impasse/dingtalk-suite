import DingTalkCrypt from './crypto'

export interface Config {
  token: string;
  encodingAESKey: string;
  suiteid: string;
  ticketExpiresIn?: number;
  saveTicket?: (Cache) => any;
}

export interface Message {
  EventType: string;
  Random?: string;
  SuiteTicket?: string;
  TimeStamp?: string;
  [propName: string]: any;
}

export interface ExpressCallback {
  (message: Message, req: any, res: any, next?: any): any;
}

export interface Koa2Callback {
  (message: Message, ctx: any, next?: any): any;
}

interface Response {
  msg_signature: string;
  encrypt: string;
  timeStamp: string;
  nonce: string;
}

export default function CallBack(config: Config, callback: ExpressCallback | Koa2Callback): Object {
  const dingCrypt = new DingTalkCrypt(config.token, config.encodingAESKey, config.suiteid || 'suite4xxxxxxxxxxxxxxx');
  const ticketExpiresIn = config.ticketExpiresIn || 1000 * 60 * 20;

  function genResponse(timestamp, nonce, text): Response {
    const encrypt = dingCrypt.encrypt(text);
    const msg_signature = dingCrypt.getSignature(timestamp, nonce, encrypt);
    return {
      msg_signature: msg_signature,
      encrypt: encrypt,
      timeStamp: timestamp,
      nonce: nonce
    }
  }

  async function koa2(ctx: { query: any, request: any, body: any, status: number, [key: string]: any }, next: any) {
    const { signature, timestamp, nonce} = ctx.query;
    const encrypt = ctx.request.body.encrypt;

    if (signature !== dingCrypt.getSignature(timestamp, nonce, encrypt)) {
      ctx.status = 401;
      ctx.body = 'Invalid signature';
      return;
    }

    let result = dingCrypt.decrypt(encrypt);
    const message = JSON.parse(result.message) as Message;

    if (message.EventType === 'check_update_suite_url' || message.EventType === 'check_create_suite_url') {
      const Random = message.Random;
      ctx.body = genResponse(timestamp, nonce, Random);
    } else {
      ctx['reply'] = function () {
        ctx.body = genResponse(timestamp, nonce, 'success');
      }
      if (config.saveTicket && message.EventType === 'suite_ticket') {
        const data = {
          value: message.SuiteTicket,
          expires: parseInt(message.TimeStamp, 10) + ticketExpiresIn
        }
        config.saveTicket(data);
        ctx['reply']();
      } else {
        return (callback as Koa2Callback)(message, ctx, next);
      }
    }
  }

  function express(req: { query: any, body: any }, res: { status: Function, json: Function, reply?: Function }, next) {
    const { signature, timestamp, nonce} = req.query;
    const encrypt = req.body.encrypt;

    if (signature !== dingCrypt.getSignature(timestamp, nonce, encrypt)) {
      return res.status(401).end('Invalid signature');
    }

    let result = dingCrypt.decrypt(encrypt);
    const message = JSON.parse(result.message) as Message;

    if (message.EventType === 'check_update_suite_url' || message.EventType === 'check_create_suite_url') {
      const Random = message.Random;
      res.json(genResponse(timestamp, nonce, Random));
    } else {
      res.reply = function () {
        res.json(genResponse(timestamp, nonce, 'success'));
      }
      if (config.saveTicket && message.EventType === 'suite_ticket') {
        const data = {
          value: message.SuiteTicket,
          expires: parseInt(message.TimeStamp, 10) + ticketExpiresIn
        }
        config.saveTicket(data);
        res.reply();
      } else {
        return (callback as ExpressCallback)(message, req, res, next);
      }
    }
  }
  return {
    koa2,
    express
  }
}
