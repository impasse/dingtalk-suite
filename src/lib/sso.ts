import agent = require('superagent')

export interface Config {
  SSOSecret: string;
  corpid: string;
}

export interface Result {
  errcode: number,
  errmsg: string
}

export type SSOToken = Result & {
  access_token: string
}

export type UserInfo = Result & {
  corp_info: Array<{
    corp_name: string,
    corpid: string
  }>,
  errcode: number,
  errmsg: string,
  is_sys: boolean,
  user_info: Array<{
    avatar: string,
    email: string,
    name: string,
    userid: string
  }>
}

const SSO_BASE_URL = 'https://oapi.dingtalk.com';

function wrapper(res) {
  const data = res.body;
  if (data.errcode === 0) {
    return data;
  } else {
    let err = new Error(data.errmsg);
    err.name = 'DingTalkAPIError';
    return Promise.reject(err);
  }
}

export default class Api {
  SSOSecret: string;
  corpid: string;
  constructor(conf: Config) {
    this.SSOSecret = conf.SSOSecret;
    this.corpid = conf.corpid;
  }

  getSSOToken(): Promise<SSOToken> {
    return agent.get(SSO_BASE_URL + '/sso/gettoken')
      .query({
        corpid: this.corpid,
        corpsecret: this.SSOSecret
      })
      .then(wrapper);
  }

  getSSOUserInfoByCode(code): Promise<UserInfo> {
    return this.getSSOToken()
      .then(token => {
        return agent.get(SSO_BASE_URL + '/sso/getuserinfo')
          .query({
            code: code,
            access_token: token.access_token
          })
          .then(wrapper);
      });
  }

  generateAuthUrl(redirect_url): string {
    return 'https://oa.dingtalk.com/omp/api/micro_app/admin/landing?corpid=' + this.corpid + '&redirect_url=' + redirect_url;
  }
}
