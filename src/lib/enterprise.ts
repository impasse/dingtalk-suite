import agent = require('superagent')
import { createHash } from 'crypto'


const BASE_URL = 'https://oapi.dingtalk.com';
const TOKEN_EXPIRES_IN = 1000 * 60 * 60 * 2 - 10000;

export interface Cache {
  value: string;
  expires: number;
}

export interface Config {
  corpid: string;
  secret: string;
  getJsApiTicket?: () => Promise<Cache>;
  saveJsApiTicket?: (Cache) => any;
  getToken?: () => Promise<Cache>;
  saveToken?: (Cache) => any;
  token_expires_in?: number;
}

export interface Result {
  errcode: number,
  errmsg: string
}

export interface Department {
  id: number,
  name: string,
  parentid: number,
  createDeptGroup: boolean,
  autoAddUser: boolean
}

export type Departments = Result & {
  department: Array<Department>
}

export type DepartmentDetail = Result & {
  id: number,
  name: string,
  order: number,
  parentid: number,
  createDeptGroup: boolean,
  autoAddUser: boolean,
  deptHiding: boolean,
  deptPerimits: string,
  userPerimits: string,
  outerDept: boolean,
  outerPermitDepts: string,
  outerPermitUsers: string,
  orgDeptOwner: string,
  deptManagerUseridList: string
}

export interface UserDetail {
  userid: string,
  dingId: string,
  mobile: string,
  tel: string,
  workPlace: string,
  remark: string,
  order: number,
  isAdmin: boolean,
  isBoss: boolean,
  isHide: boolean,
  isLeader: boolean,
  name: string,
  active: boolean,
  department: Array<number>
  position: string,
  email: string,
  avatar: string,
  jobnumber: string,
  extattr: {
    [attrName: string]: string
  }
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

function createNonceStr() {
  return Math.random().toString(36).substr(2, 15);
}

function raw(args) {
  return Object.keys(args).sort().map(k => k + '=' + args[k]).join('&');
}

function sign(ret) {
  return createHash('sha1').update(raw(ret)).digest('hex');
}

export default class Api {
  corpid: string;
  secret: string;
  getJsApiTicket: () => Promise<Cache>;
  saveJsApiTicket: (Cache) => any;
  getToken: () => Promise<Cache>;
  saveToken: (Cache) => any;
  token_expires_in: number;
  token_cache: Cache;
  jsapi_ticket_cache: Cache;
  newSuiteApi: any;

  constructor(conf: Config) {
    this.corpid = conf.corpid;
    this.secret = conf.secret;
    this.token_cache = null;
    this.jsapi_ticket_cache = null;
    this.getJsApiTicket = conf.getJsApiTicket || function () { return Promise.resolve(null) };
    this.saveJsApiTicket = conf.saveJsApiTicket || function () { return Promise.resolve(null) };
    this.getToken = conf.getToken || function () { return Promise.resolve(this.token_cache); };
    this.saveToken = conf.saveToken || function (token: string) {
      this.token_cache = token;
      if (process.env.NODE_ENV === 'production') {
        console.warn('Don\'t save token in memory, when cluster or multi-computer!');
      }
      Promise.resolve(this.token_cache);
    };
    this.token_expires_in = conf.token_expires_in || TOKEN_EXPIRES_IN;
  }

  _get_access_token() {
    return agent.get(BASE_URL + '/gettoken')
      .query({
        corpid: this.corpid,
        corpsecret: this.secret
      })
      .then(wrapper);
  }

  getLatestToken(): Promise<{ value: string, expires: number }> {
    if (!this.token_cache) {
      return this.getToken().then(token => {
        this.token_cache = token || { value: null, expires: 0 };
        return this.getLatestToken();
      });
    } else {
      const now = Date.now();
      if (this.token_cache.expires <= now) {
        return this._get_access_token().then(token => {
          this.token_cache = { value: token.access_token, expires: now + this.token_expires_in };
          this.saveToken(this.token_cache);
          return this.token_cache;
        });
      } else {
        return Promise.resolve(this.token_cache);
      }
    }
  }

  get(path, data: { access_token: string }): Promise<Result> {
    return this.getLatestToken().then(token => {
      data.access_token = token.value;
      return agent.get(BASE_URL + path)
        .query(data)
        .then(wrapper);
    });
  }

  post(path, data): Promise<Result> {
    return this.getLatestToken()
      .then(token => {
        return agent.post(BASE_URL + path)
          .query({ access_token: token.value })
          .send(data)
          .then(wrapper);
      });
  }

  getDepartments(): Promise<Departments> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/department/list')
          .query({ access_token: token.value })
          .then(wrapper);
      });
  }

  getDepartmentDetail(id: number): Promise<DepartmentDetail> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/department/get')
          .query({ id: id, access_token: token.value })
          .then(wrapper);
      });
  }

  createDepartment(name: string, opts: { name?: string, parentid?: any }): Promise<Result & { id: number }> {
    return this.getLatestToken()
      .then(function (token) {
        if (typeof opts === 'object') {
          opts.name = name;
          opts.parentid = opts.parentid || 1;
        } else {
          opts = {
            name: name,
            parentid: opts
          };
        }
        return agent.post(BASE_URL + '/department/create')
          .query({ access_token: token.value })
          .send(opts)
          .then(wrapper);
      });
  }

  updateDepartment(id: number, opts): Promise<Result> {
    return this.getLatestToken()
      .then(function (token) {
        if (typeof opts === 'object') {
          opts.id = id;
        } else {
          opts = { name: opts, id: id }
        }
        return agent.post(BASE_URL + '/department/update')
          .query({ access_token: token.value })
          .send(opts)
          .then(wrapper);
      });
  }

  deleteDepartment(id: number): Promise<Result> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/department/delete')
          .query({ id: id, access_token: token.value })
          .then(wrapper);
      });
  }

  createMicroApp(data: Object): Promise<Result & { id: number }> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.post(BASE_URL + '/microapp/create')
          .query({ access_token: token.value })
          .send(data)
          .then(wrapper);
      });
  }

  sendToConversation(): Promise<Result & { receiver: string }> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.post(BASE_URL + '/message/send_to_conversation')
          .query({ access_token: token.value })
          .then(wrapper);
      });
  }

  send(agentid: number, options): Promise<Result & {
    invaliduser: string,
    invalidparty: string,
    messageId: string
  }> {
    return this.getLatestToken()
      .then(function (token) {
        options.agentid = agentid + '';
        return agent.post(BASE_URL + '/message/send')
          .query({ access_token: token.value })
          .send(options)
          .then(wrapper);
      });
  }

  getDepartmentUsers(id: number): Promise<Result & {
    hasMore: boolean,
    userlist: Array<{
      userid: string,
      name: string
    }>
  }> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/user/simplelist')
          .query({ department_id: id, access_token: token.value })
          .then(wrapper);
      });
  }

  getDepartmentUsersDetail(id: number): Promise<Result & {
    hasMore: boolean,
    userlist: Array<UserDetail>
  }> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/user/list')
          .query({ department_id: id, access_token: token.value })
          .then(wrapper);
      });
  }

  getUser(id: number): Promise<UserDetail> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/user/get')
          .query({ userid: id, access_token: token.value })
          .then(wrapper);
      });
  }

  getUserInfoByCode(code: string): Promise<Result & {
    userid: string,
    deviceId: string,
    is_sys: boolean,
    sys_level: number
  }> {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/user/getuserinfo')
          .query({ code: code, access_token: token.value })
          .then(wrapper);
      });
  }

  _get_jsApi_ticket() {
    return this.getLatestToken()
      .then(function (token) {
        return agent.get(BASE_URL + '/get_jsapi_ticket')
          .query({ type: 'jsapi', access_token: token.value })
          .then(wrapper);
      });
  }

  getLatestJsApiTicket(): Promise<Cache> {
    if (!this.jsapi_ticket_cache) {
      return this.getJsApiTicket().then((data) => {
        this.jsapi_ticket_cache = data || { value: null, expires: 0 };
        return this.getLatestJsApiTicket();
      });
    } else {
      const now = Date.now();
      if (this.jsapi_ticket_cache.expires <= now) {
        return this._get_jsApi_ticket().then(data => {
          this.jsapi_ticket_cache = { value: data.ticket, expires: now + this.token_expires_in };
          this.saveJsApiTicket(data);
          return this.jsapi_ticket_cache;
        })
      } else {
        return Promise.resolve(this.jsapi_ticket_cache);
      }
    }
  }

  getUrlSign(url): any {
    return this.getLatestJsApiTicket().then(function (data) {
      let result: any = {
        noncestr: createNonceStr(),
        jsapi_ticket: data.value,
        timestamp: Date.now(),
        url: url
      }
      const signature = sign(result);
      result = {
        signature: signature,
        timeStamp: result.timestamp.toString(),
        nonceStr: result.noncestr
      }
      return result;
    })
  }

  fromSuite(newSuiteApi, conf): any {
    Object.assign(this, conf);
    this.newSuiteApi = newSuiteApi;
  }

  ctrl(corpid, permanent_code, token_cache, jsapi_ticket_cache): this {
    this.corpid = corpid;
    this.token_cache = token_cache;
    this.jsapi_ticket_cache = jsapi_ticket_cache;

    const api = new Api(this as Config);
    const newSuiteApi = this.newSuiteApi;
    api._get_access_token = function () {
      return newSuiteApi.getCorpToken(corpid, permanent_code);
    }
    return api as this;
  }
}
