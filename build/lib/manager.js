"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Manager = exports.ManagerGeneric = exports.MCEvent = void 0;
const fs_1 = require("fs");
const jsdom_1 = require("jsdom");
const pacote_1 = __importDefault(require("pacote"));
const path_1 = __importDefault(require("path"));
const index_1 = require("./cache/index");
const constants_1 = require("./constants");
const kv_storage_1 = require("./storage/kv-storage");
class MCEvent extends Event {
    name;
    payload;
    client;
    type;
    constructor(type, req) {
        super(type);
        this.type = type;
        this.payload = req.body.payload || { timestamp: new Date().getTime() }; // because pageviews are symbolic requests without a payload
        this.name = type === 'ecommerce' ? this.payload.name : undefined;
    }
}
exports.MCEvent = MCEvent;
const EXTS = ['.mjs', '.js', '.mts', '.ts'];
class ManagerGeneric {
    components;
    trackPath;
    name;
    componentsFolderPath;
    requiredSnippets;
    mappedEndpoints;
    proxiedEndpoints;
    staticFiles;
    listeners;
    clientListeners;
    registeredEmbeds;
    registeredWidgets;
    permissions;
    constructor(Context) {
        this.componentsFolderPath =
            Context.componentsFolderPath || path_1.default.join(__dirname, '..', 'components');
        this.requiredSnippets = ['track'];
        this.registeredWidgets = [];
        this.registeredEmbeds = {};
        this.listeners = {};
        this.permissions = {};
        this.clientListeners = {};
        this.mappedEndpoints = {};
        this.proxiedEndpoints = {};
        this.staticFiles = {};
        this.name = 'WebCM';
        this.trackPath = Context.trackPath;
        this.components = Context.components;
    }
    route(component, path, callback) {
        const fullPath = '/webcm/' + component + path;
        this.mappedEndpoints[fullPath] = callback;
        return fullPath;
    }
    proxy(component, path, target) {
        this.proxiedEndpoints[component] ||= {};
        this.proxiedEndpoints[component][path] = target;
        return '/webcm/' + component + path;
    }
    serve(component, path, target) {
        const fullPath = '/webcm/' + component + path;
        this.staticFiles[fullPath] = component + '/' + target;
        return fullPath;
    }
    addEventListener(component, type, callback) {
        if (!this.requiredSnippets.includes(type)) {
            this.requiredSnippets.push(type);
        }
        this.listeners[type] ||= {};
        this.listeners[type][component] ||= [];
        this.listeners[type][component].push(callback);
    }
    async initComponent(component, name, settings, permissions) {
        if (component) {
            try {
                // save component permissions in memory
                this.permissions[name] = permissions;
                console.info(':: Initialising component', name);
                await component.default(new Manager(name, this), settings);
            }
            catch (error) {
                console.error(':: Error initialising component', component, error);
            }
        }
    }
    async loadComponentManifest(basePath) {
        let manifest;
        const manifestPath = path_1.default.join(basePath, 'manifest.json');
        if ((0, fs_1.existsSync)(manifestPath)) {
            manifest = JSON.parse((0, fs_1.readFileSync)(manifestPath, 'utf8'));
        }
        else {
            manifest = {};
        }
        return manifest;
    }
    async fetchLocalComponent(basePath) {
        let component;
        const pkgPath = path_1.default.join(basePath, 'package.json');
        if ((0, fs_1.existsSync)(pkgPath)) {
            const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf8'));
            const main = pkg.main;
            const mainPath = path_1.default.join(basePath, main);
            if ((0, fs_1.existsSync)(mainPath)) {
                console.info('FOUND LOCAL MC:', mainPath);
                component = mainPath.endsWith('.mjs')
                    ? await import(mainPath)
                    : require(mainPath);
            }
            else {
                console.error(`No executable file for component at ${mainPath}`);
            }
        }
        else {
            for (const ext of EXTS) {
                const componentPath = path_1.default.join(basePath, 'index' + ext);
                if ((0, fs_1.existsSync)(componentPath)) {
                    console.info('FOUND LOCAL MC:', componentPath);
                    component =
                        ext === '.mjs'
                            ? await import(componentPath)
                            : require(componentPath);
                    break;
                }
            }
            if (!component) {
                console.error(`No executable file for component in ${basePath}`);
            }
        }
        const manifest = await this.loadComponentManifest(basePath);
        return { component, manifest };
    }
    async fetchRemoteComponent(basePath, name) {
        let component;
        const componentPath = path_1.default.join(this.componentsFolderPath, name);
        try {
            await pacote_1.default.extract(`@managed-components/${name}`, componentPath);
            component = await this.fetchLocalComponent(basePath);
        }
        catch (error) {
            console.error(':: Error fetching remote component', name, error);
            (0, fs_1.rmdir)(componentPath, () => console.info(':::: Removed empty component folder', componentPath));
        }
        return component;
    }
    async loadComponent(name) {
        const localPathBase = path_1.default.join(this.componentsFolderPath, name);
        return (0, fs_1.existsSync)(localPathBase)
            ? this.fetchLocalComponent(localPathBase)
            : this.fetchRemoteComponent(localPathBase, name);
    }
    async hasRequiredPermissions(component, requiredPermissions, givenPermissions) {
        let hasPermissions = true;
        const missingPermissions = [];
        for (const [key, permission] of Object.entries(requiredPermissions || {})) {
            if (permission.required && !givenPermissions.includes(key)) {
                hasPermissions = false;
                missingPermissions.push(key);
            }
        }
        !hasPermissions &&
            console.error('\x1b[31m', `\n🔒 MISSING REQUIRED PERMISSIONS :: ${component} component requires additional permissions:\n`, '\x1b[33m', `\t${JSON.stringify(missingPermissions)} \n`);
        !hasPermissions && process.exit(1);
        return hasPermissions;
    }
    async init() {
        for (const compConfig of this.components) {
            const { name, settings = {}, permissions } = compConfig;
            const { component, manifest } = (await this.loadComponent(name)) || {};
            await this.initComponent(component, name, settings, permissions);
            this.hasRequiredPermissions(name, manifest.permissions, permissions);
        }
    }
    getInjectedScript(clientGeneric) {
        let injectedScript = '';
        const clientListeners = new Set(Object.values(clientGeneric.webcmPrefs.listeners).flat());
        for (const snippet of [...this.requiredSnippets, ...clientListeners]) {
            const snippetPath = path_1.default.join(__dirname, 'browser', `${snippet}.js`);
            if ((0, fs_1.existsSync)(snippetPath)) {
                injectedScript += (0, fs_1.readFileSync)(snippetPath)
                    .toString()
                    .replace('TRACK_PATH', this.trackPath);
            }
        }
        return injectedScript;
    }
    async processEmbeds(response) {
        const dom = new jsdom_1.JSDOM(response);
        for (const div of dom.window.document.querySelectorAll('div[data-component-embed]')) {
            const parameters = Object.fromEntries(Array.prototype.slice
                .call(div.attributes)
                .map(attr => [attr.nodeName.replace('data-', ''), attr.nodeValue]));
            const name = parameters['component-embed'];
            if (this.registeredEmbeds[name]) {
                const embed = await this.registeredEmbeds[name]({ parameters });
                const iframe = `<iframe sandbox="allow-scripts" src="about:blank" style="border: 0"srcDoc="${embed}"></iframe>`;
                div.innerHTML = iframe;
            }
        }
        return dom.serialize();
    }
    async processWidgets(response) {
        const dom = new jsdom_1.JSDOM(response);
        for (const fn of this.registeredWidgets) {
            const widget = await fn();
            const div = dom.window.document.createElement('div');
            div.innerHTML = widget;
            dom.window.document.body.appendChild(div);
        }
        return dom.serialize();
    }
    checkPermissions(component, method) {
        const componentPermissions = this.permissions[component] || [];
        if (!componentPermissions.includes(method)) {
            console.error(`⚠️  ${component} component: ${method?.toLocaleUpperCase()} - permissions not granted `);
            return false;
        }
        return true;
    }
}
exports.ManagerGeneric = ManagerGeneric;
class Manager {
    #generic;
    #component;
    name;
    constructor(component, generic) {
        this.#generic = generic;
        this.#component = component;
        this.name = this.#generic.name;
    }
    addEventListener(type, callback) {
        this.#generic.addEventListener(this.#component, type, callback);
        return true;
    }
    createEventListener(type, callback) {
        this.#generic.clientListeners[`${type}__${this.#component}`] = callback;
        return true;
    }
    get(key) {
        return (0, kv_storage_1.get)(this.#component + '__' + key);
    }
    set(key, value) {
        return (0, kv_storage_1.set)(this.#component + '__' + key, value);
    }
    route(path, callback) {
        if (this.#generic.checkPermissions(this.#component, constants_1.PERMISSIONS.route)) {
            return this.#generic.route(this.#component, path, callback);
        }
    }
    proxy(path, target) {
        if (this.#generic.checkPermissions(this.#component, constants_1.PERMISSIONS.proxy)) {
            return this.#generic.proxy(this.#component, path, target);
        }
    }
    serve(path, target) {
        if (this.#generic.checkPermissions(this.#component, constants_1.PERMISSIONS.serve)) {
            return this.#generic.serve(this.#component, path, target);
        }
    }
    // eslint-disable-next-line @typescript-eslint/ban-types
    async useCache(key, callback, expiry) {
        return await (0, index_1.useCache)(this.#component + '__' + key, callback, expiry);
    }
    invalidateCache(key) {
        (0, index_1.invalidateCache)(this.#component + '__' + key);
        return true;
    }
    registerEmbed(name, callback) {
        this.#generic.registeredEmbeds[this.#component + '__' + name] = callback;
        return true;
    }
    registerWidget(callback) {
        if (this.#generic.checkPermissions(this.#component, constants_1.PERMISSIONS.widget)) {
            this.#generic.registeredWidgets.push(callback);
            return true;
        }
    }
}
exports.Manager = Manager;
