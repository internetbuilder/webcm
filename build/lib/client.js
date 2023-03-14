"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = exports.ClientGeneric = void 0;
const cookies_1 = __importDefault(require("cookies"));
const constants_1 = require("./constants");
class ClientGeneric {
    type = 'browser';
    title;
    timestamp;
    offset;
    request;
    response;
    manager;
    url;
    cookies;
    cookiesKey;
    pendingVariables;
    pageVars;
    webcmPrefs;
    constructor(request, response, manager, config) {
        this.cookiesKey = config.cookiesKey || '';
        this.manager = manager;
        this.request = request;
        this.response = response;
        this.pendingVariables = {};
        this.title = request.body.title;
        this.timestamp = request.body.timestamp || new Date().getTime();
        this.pageVars = request.body.pageVars || {};
        this.offset = request.body.offset;
        this.url = new URL(request.body?.location?.href ||
            'http://' + config.hostname + request.originalUrl);
        this.cookies = new cookies_1.default(request, response, { keys: [this.cookiesKey] });
        if (this.cookies.get('webcm_prefs', { signed: !!this.cookiesKey })) {
            this.webcmPrefs = JSON.parse(this.cookies.get('webcm_prefs', { signed: !!this.cookiesKey }) || '');
        }
        else {
            this.webcmPrefs = { listeners: {} };
        }
        this.cookies.set('webcm_prefs', JSON.stringify(this.webcmPrefs), {
            signed: true,
        });
    }
    execute(code) {
        this.response.payload.execute.push(code);
    }
    return(component, value) {
        this.response.payload.return ||= {};
        this.response.payload.return[component] = value;
    }
    fetch(resource, settings) {
        this.response.payload.fetch.push([resource, settings || {}]);
    }
    set(key, value, opts) {
        const cookieOpts = { signed: !!this.cookiesKey };
        const { expiry, scope = 'infinite' } = opts || {};
        if (typeof expiry === 'number') {
            cookieOpts.maxAge = expiry;
        }
        if (expiry instanceof Date) {
            cookieOpts.expires = expiry;
        }
        switch (scope) {
            case 'page':
                this.response.payload.pageVars.push([key, value]);
                break;
            case 'session':
                delete cookieOpts.expires;
                delete cookieOpts.maxAge;
                this.cookies.set(key, value, cookieOpts);
                break;
            default:
                cookieOpts.maxAge ||= 31536000000000;
                this.cookies.set(key, value, cookieOpts);
                break;
        }
        if (value === null || value === undefined) {
            delete this.pendingVariables[key];
        }
        else {
            this.pendingVariables[key] = value;
        }
    }
    get(key) {
        return (this.cookies.get(key, { signed: !!this.cookiesKey }) ||
            this.pageVars[key] ||
            this.pendingVariables[key]);
    }
    attachEvent(component, event) {
        if (!this.webcmPrefs.listeners[component]) {
            this.webcmPrefs.listeners[component] = [event];
        }
        else {
            this.webcmPrefs.listeners[component].push(event);
        }
        this.cookies.set('webcm_prefs', JSON.stringify(this.webcmPrefs), {
            signed: true,
        });
    }
    detachEvent(component, event) {
        const eventIndex = this.webcmPrefs.listeners[component].indexOf(event);
        if (eventIndex > -1) {
            this.webcmPrefs.listeners[component].splice(eventIndex, 1);
            this.cookies.set('webcm_prefs', JSON.stringify(this.webcmPrefs), {
                signed: true,
            });
        }
    }
}
exports.ClientGeneric = ClientGeneric;
class Client {
    #generic;
    #component;
    emitter;
    userAgent;
    language;
    referer;
    ip;
    title;
    timestamp;
    url;
    constructor(component, generic) {
        this.#generic = generic;
        this.#component = component;
        this.url = this.#generic.url;
        this.title = this.#generic.title;
        this.timestamp = this.#generic.timestamp;
        this.emitter = 'browser';
        this.userAgent = this.#generic.request.headers['user-agent'] || '';
        this.language = this.#generic.request.headers['accept-language'] || '';
        this.referer = this.#generic.request.headers.referer || '';
        this.ip = this.#generic.request.ip || '';
    }
    return(value) {
        this.#generic.return(this.#component, value);
    }
    get(key, componentOverride) {
        const permission = componentOverride
            ? constants_1.PERMISSIONS.clientExtGet
            : constants_1.PERMISSIONS.clientGet;
        if (this.#generic.manager.checkPermissions(this.#component, permission)) {
            const component = componentOverride || this.#component;
            return this.#generic.get(component + '__' + key);
        }
    }
    set(key, value, opts) {
        if (this.#generic.manager.checkPermissions(this.#component, constants_1.PERMISSIONS.clientSet)) {
            this.#generic.set(this.#component + '__' + key, value, opts);
            return true;
        }
    }
    fetch(resource, settings) {
        if (this.#generic.manager.checkPermissions(this.#component, constants_1.PERMISSIONS.clientFetch)) {
            this.#generic.fetch(resource, settings);
            return true;
        }
    }
    execute(code) {
        if (this.#generic.manager.checkPermissions(this.#component, constants_1.PERMISSIONS.clientExecute)) {
            this.#generic.execute(code);
            return true;
        }
    }
    attachEvent(event) {
        this.#generic.attachEvent(this.#component, event);
    }
    detachEvent(event) {
        this.#generic.detachEvent(this.#component, event);
    }
}
exports.Client = Client;
