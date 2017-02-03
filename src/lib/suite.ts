import agent = require('superagent')

const BASE_URL = 'https://oapi.dingtalk.com/service';
const SSO_BASE_URL = 'https://oapi.dingtalk.com';
const TICKET_EXPIRES_IN = 1000 * 60 * 20;
const TOKEN_EXPIRES_IN = 1000 * 60 * 60 * 2 - 10000;

export interface Cache {
  value: string;
  expires: number;
}

export interface Config {
  suiteid: string;
  secret: string;
  token_expires_in: number;
  getTicket: () => Promise<Cache>;
  getToken: () => Promise<Cache>;
  saveToken: (Cache) => any;
}

export interface Result {
  errcode: number,
  errmsg: string,
  [propName: string]: any
}


export interface PermanentCode {
  permanent_code: string,
  auth_corp_info:
  {
    corpid: string,
    corp_name: string
  }
}

export interface CorpToken {
  access_token: string,
  expires_in: number
}

export type AuthInfo = Result & {
  auth_corp_info: {
    corp_logo_url: string,
    corp_name: string,
    corpid: string,
    industry: string,
    invite_code: string,
    license_code: string,
    auth_channel: string,
    is_authenticated: boolean,
    auth_level: number,
    invite_url: string
  },
  auth_user_info:
  {
    userId: string
  },
  auth_info: {
    agent: [{
      agent_name: string,
      agentid: number,
      appid: number,
      logo_url: string
    }
      , {
        agent_name: string,
        agentid: number,
        appid: number,
        logo_url: string
      }]
  }
}

export type Agent = Result & {
  agentid: number,
  name: string,
  logo_url: string,
  description: string,
  close: number,
  errcode: number,
  errmsg: string
}


function wrapper(res) {
  let data = res.body;
  if (data.errcode === 0) {
    return data;
  } else {
    let err = new Error(data.errmsg);
    err.name = 'DingTalkAPIError';
    return Promise.reject(err);
  }
}

export default class Api {
  suite_key: string;
  suite_secret: string;
  ticket_expires_in: number;
  token_expires_in: number;
  getTicket: () => Promise<Cache>;
  ticket_cache: Cache;
  token_cache: Cache;
  getToken: () => Promise<Cache>;
  saveToken: (Cache) => any;

  constructor(conf: Config) {
    this.suite_key = conf.suiteid;
    this.suite_secret = conf.secret;
    this.ticket_expires_in = TICKET_EXPIRES_IN;
    this.token_expires_in = conf.token_expires_in || TOKEN_EXPIRES_IN;
    this.getTicket = conf.getTicket;
    this.ticket_cache = {
      expires: 0,
      value: null
    };
    this.token_cache = null;
    this.getToken = conf.getToken || (() => {
      return Promise.resolve(this.token_cache);
    });
    this.saveToken = conf.saveToken || ((token) => {
      this.token_cache = token;
    });
  }

  getLatestTicket(): Promise<Cache> {
    const now = Date.now();
    if (this.ticket_cache.expires <= now) {
      return this.getTicket();
    } else {
      return Promise.resolve(this.ticket_cache);
    }
  }

  _get_access_token(): Promise<{ suite_access_token: string }> {
    return this.getLatestTicket().then(ticket => {
      const data = {
        suite_key: this.suite_key,
        suite_secret: this.suite_secret,
        suite_ticket: ticket.value
      };
      return agent.post(BASE_URL + '/get_suite_token').send(data).then(wrapper) as Promise<{ suite_access_token: string }>;
    });
  }

  getLatestToken(): Promise<Cache> {
    if (!this.token_cache) {
      return this.getToken().then(token => {
        if (!token) {
          const now = Date.now();
          return this._get_access_token().then(token => {
            this.token_cache = {
              value: token.suite_access_token,
              expires: now + this.token_expires_in
            };
            this.saveToken(this.token_cache);
            return this.token_cache;
          });
        }
        this.token_cache = token;
        return this.getLatestToken();
      });
    } else {
      const now = Date.now();
      if (this.token_cache.expires <= now) {
        return this._get_access_token().then(token => {
          this.token_cache = {
            value: token.suite_access_token,
            expires: now + this.token_expires_in
          };
          this.saveToken(this.token_cache);
          return this.token_cache;
        });
      } else {
        return Promise.resolve(this.token_cache);
      }
    }
  }

  getPermanentCode(tmp_auth_code): Promise<PermanentCode> {
    return this.getLatestToken().then(function (token) {
      return agent.post(BASE_URL + '/get_permanent_code')
        .query({ suite_access_token: token.value })
        .send({ tmp_auth_code: tmp_auth_code })
        .then(wrapper) as Promise<PermanentCode>;
    });
  }

  getCorpToken(auth_corpid, permanent_code): Promise<CorpToken> {
    return this.getLatestToken().then(function (token) {
      return agent.post(BASE_URL + '/get_corp_token')
        .query({ suite_access_token: token.value })
        .send({
          auth_corpid: auth_corpid,
          permanent_code: permanent_code
        })
        .then(wrapper) as Promise<CorpToken>;
    });
  }

  getAuthInfo(auth_corpid, permanent_code): Promise<AuthInfo> {
    return this.getLatestToken().then(token => {
      return agent.post(BASE_URL + '/get_auth_info')
        .query({ suite_access_token: token.value })
        .send({ suite_key: this.suite_key, auth_corpid: auth_corpid, permanent_code: permanent_code })
        .then(wrapper) as Promise<AuthInfo>;
    });
  }

  getAgent(agentid, auth_corpid, permanent_code): Promise<Agent> {
    return this.getLatestToken().then(token => {
      return agent.post(BASE_URL + '/get_agent')
        .query({ suite_access_token: token.value })
        .send({
          suite_key: this.suite_key,
          auth_corpid: auth_corpid,
          permanent_code: permanent_code,
          agentid: agentid
        })
        .then(wrapper) as Promise<Agent>;
    });
  }

  activateSuite(auth_corpid, permanent_code): Promise<Result> {
    return this.getLatestToken().then(token => {
      return agent.post(BASE_URL + '/activate_suite')
        .query({ suite_access_token: token.value })
        .send({ suite_key: this.suite_key, auth_corpid: auth_corpid, permanent_code: permanent_code })
        .then(wrapper) as Promise<Result>;
    });
  }

  setCorpIpwhitelist(auth_corpid, ip_whitelist): Promise<Result> {
    return this.getLatestToken().then(token => {
      return agent.post(BASE_URL + '/set_corp_ipwhitelist')
        .query({ suite_access_token: token.value })
        .send({ suite_key: this.suite_key, auth_corpid: auth_corpid, ip_whitelist: ip_whitelist })
        .then(wrapper) as Promise<Result>;
    });
  }

}
