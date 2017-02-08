import agent = require('superagent')
import { createHash } from 'crypto'


const BASE_URL = 'https://oapi.dingtalk.com';

export interface Cache {
  value: string;
  expires: number;
}

export interface Config {
  corpid: string;
  secret: string;
  getJsApiTicket?: () => Promise<Cache>;
  saveJsApiTicket?: (Cache) => any;
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
  jsapi_ticket_cache: Cache;
  newSuiteApi: any;

  constructor(conf: Config) {
    this.corpid = conf.corpid;
    this.secret = conf.secret;
    this.newSuiteApi = null;
    this.jsapi_ticket_cache = null;
    this.getJsApiTicket = conf.getJsApiTicket || function () { return Promise.resolve(null) };
    this.saveJsApiTicket = conf.saveJsApiTicket || function () { return Promise.resolve(null) };
  }

  async _get_access_token(): Promise<any> {
    return agent.get(BASE_URL + '/gettoken')
      .query({
        corpid: this.corpid,
        corpsecret: this.secret
      })
      .then(wrapper);
  }

  async getLatestToken(): Promise<Cache> {
    let rawToken = await this._get_access_token();
    return {
      value: rawToken.access_token,
      expires: Infinity
    };
  }

  async get(path, data: { access_token: string }): Promise<Result> {
    let token = await this.getLatestToken();
    data.access_token = token.value;
    return agent.get(BASE_URL + path)
      .query(data)
      .then(wrapper) as Promise<Result>;
  }

  async post(path, data): Promise<Result> {
    let token = await this.getLatestToken();
    return agent.post(BASE_URL + path)
      .query({ access_token: token.value })
      .send(data)
      .then(wrapper) as Promise<Result>;
  }

  async getDepartments(): Promise<Departments> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/department/list')
      .query({ access_token: token.value })
      .then(wrapper) as Promise<Departments>;
  }

  async getDepartmentDetail(id: number): Promise<DepartmentDetail> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/department/get')
      .query({ id: id, access_token: token.value })
      .then(wrapper) as Promise<DepartmentDetail>;
  }

  async createDepartment<T extends Result & { id: number }>(name: string, opts: { name?: string, parentid?: any }): Promise<T> {
    let token = await this.getLatestToken();
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
      .then(wrapper) as Promise<T>;
  }

  async updateDepartment(id: number, opts): Promise<Result> {
    let token = await this.getLatestToken();
    if (typeof opts === 'object') {
      opts.id = id;
    } else {
      opts = { name: opts, id: id }
    }
    return agent.post(BASE_URL + '/department/update')
      .query({ access_token: token.value })
      .send(opts)
      .then(wrapper) as Promise<Result>;
  }

  async deleteDepartment(id: number): Promise<Result> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/department/delete')
      .query({ id: id, access_token: token.value })
      .then(wrapper) as Promise<Result>;
  }

  async createMicroApp<T extends Result & { id: number }>(data: Object): Promise<T> {
    let token = await this.getLatestToken();
    return agent.post(BASE_URL + '/microapp/create')
      .query({ access_token: token.value })
      .send(data)
      .then(wrapper) as Promise<T>;
  }

  async getMicroAppVisibleScopes<T extends Result & { isHidden: boolean, deptVisibleScopes: Array<number>, userVisibleScopes: Array<string> }>(agentId: number): Promise<T> {
    let token = await this.getLatestToken();
    return agent.post(BASE_URL + '/microapp/visible_scopes')
      .query({ access_token: token.value })
      .send({ agentId })
      .then(wrapper) as Promise<T>
  }

  async setMicroAppVisibleScopes(data: { agentId: number, isHidden: boolean, deptVisibleScopes: Array<number>, userVisibleScopes: Array<string> }): Promise<Result> {
    let token = await this.getLatestToken();
    return agent.post(BASE_URL + '/microapp/set_visible_scopes')
      .query({ access_token: token.value })
      .send(data)
      .then(wrapper);
  }

  async sendToConversation<T extends Result & { receiver: string }>(): Promise<T> {
    let token = await this.getLatestToken();
    return agent.post(BASE_URL + '/message/send_to_conversation')
      .query({ access_token: token.value })
      .then(wrapper) as Promise<T>;
  }

  async send<T extends Result & {
    invaliduser: string,
    invalidparty: string,
    messageId: string
  }>(agentid: number, options): Promise<T> {
    let token = await this.getLatestToken();
    options.agentid = agentid + '';
    return agent.post(BASE_URL + '/message/send')
      .query({ access_token: token.value })
      .send(options)
      .then(wrapper) as Promise<T>;
  }

  async getDepartmentUsers<T extends Result & {
    hasMore: boolean,
    userlist: Array<{
      userid: string,
      name: string
    }>
  }>(id: number): Promise<T> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/user/simplelist')
      .query({ department_id: id, access_token: token.value })
      .then(wrapper) as Promise<T>;
  }

  async getDepartmentUsersDetail<T extends Result & {
    hasMore: boolean,
    userlist: Array<UserDetail>
  }>(id: number): Promise<T> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/user/list')
      .query({ department_id: id, access_token: token.value })
      .then(wrapper) as Promise<T>;
  }

  async getUser(id: number): Promise<UserDetail> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/user/get')
      .query({ userid: id, access_token: token.value })
      .then(wrapper) as Promise<UserDetail>;
  }

  async getUserInfoByCode<T extends Result & {
    userid: string,
    deviceId: string,
    is_sys: boolean,
    sys_level: number
  }>(code: string): Promise<T> {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/user/getuserinfo')
      .query({ code: code, access_token: token.value })
      .then(wrapper) as Promise<T>;
  }

  async _get_jsApi_ticket() {
    let token = await this.getLatestToken();
    return agent.get(BASE_URL + '/get_jsapi_ticket')
      .query({ type: 'jsapi', access_token: token.value })
      .then(wrapper);
  }

  async getLatestJsApiTicket(): Promise<Cache> {
    if (!this.jsapi_ticket_cache) {
      let data = await this.getJsApiTicket();
      this.jsapi_ticket_cache = data || { value: null, expires: 0 };
      return this.getLatestJsApiTicket();
    } else {
      const now = Date.now();
      if (this.jsapi_ticket_cache.expires <= now) {
        let data = await this._get_jsApi_ticket();
        this.jsapi_ticket_cache = { value: data.ticket, expires: now + data.expires_in * 1000 };
        this.saveJsApiTicket(data);
      }
      return this.jsapi_ticket_cache;
    }
  }

  async getUrlSign(url) {
    let data = await this.getLatestJsApiTicket();
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
  }

  static fromSuite(originSuite, corpid, permanent_code, conf) {
    let v = new Api({} as any);
    v.corpid = corpid;
    Object.assign(v, conf);
    let suite = originSuite;
    v._get_access_token = async function () {
      let corpToken = await suite.getCorpToken(corpid, permanent_code);
      return { value: corpToken.access_token, expires: corpToken.expires_in };
    }
    return v;
  }
}
