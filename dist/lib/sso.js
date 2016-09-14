"use strict";
const agent = require('superagent');
require('./common');
const SSO_BASE_URL = 'https://oapi.dingtalk.com';
function wrapper(res) {
    const data = res.body;
    if (data.errcode === 0) {
        return data;
    }
    else {
        let err = new Error(data.errmsg);
        err.name = 'DingTalkAPIError';
        return Promise.reject(err);
    }
}
class Api {
    constructor(conf) {
        this.SSOSecret = conf.SSOSecret;
        this.corpid = conf.corpid;
    }
    getSSOToken() {
        return agent.get(SSO_BASE_URL + '/sso/gettoken')
            .query({
            corpid: this.corpid,
            corpsecret: this.SSOSecret
        })
            .then(wrapper);
    }
    getSSOUserInfoByCode(code) {
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
    generateAuthUrl(redirect_url) {
        return 'https://oa.dingtalk.com/omp/api/micro_app/admin/landing?corpid=' + this.corpid + '&redirect_url=' + redirect_url;
    }
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Api;
