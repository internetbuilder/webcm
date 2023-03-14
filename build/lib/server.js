"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startServer = void 0;
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const http_proxy_middleware_1 = require("http-proxy-middleware");
const fs_path = __importStar(require("path"));
const package_json_1 = require("../package.json");
const client_1 = require("./client");
const manager_1 = require("./manager");
if (process.env.NODE_ENV === 'production') {
    process.on('unhandledRejection', (reason) => {
        console.log('Unhandled Rejection at:', reason.stack || reason);
    });
}
const startServer = async (configPath, componentsFolderPath) => {
    const configFullPath = fs_path.resolve(configPath);
    if (!fs_1.default.existsSync(configFullPath)) {
        console.error('Could not load WebCM config from', configFullPath);
        console.log('\nPlease create your configuration and run WebCM again.');
        process.exit(1);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const config = require(configFullPath).default;
    const componentsPath = componentsFolderPath
        ? fs_path.resolve(componentsFolderPath)
        : '';
    const { target: configTarget, hostname, port, trackPath, components } = config;
    const target = process.env.CM_TARGET_URL || configTarget;
    const manager = new manager_1.ManagerGeneric({
        components,
        trackPath,
        componentsFolderPath: componentsPath,
    });
    await manager.init();
    const getDefaultPayload = () => ({
        pageVars: [],
        fetch: [],
        execute: [],
        return: undefined,
    });
    const handleEvent = (eventType, req, res) => {
        res.payload = getDefaultPayload();
        if (manager.listeners[eventType]) {
            // slightly alter ecommerce payload
            if (eventType === 'ecommerce') {
                req.body.payload.ecommerce = { ...req.body.payload.data };
                delete req.body.payload.data;
            }
            const event = new manager_1.MCEvent(eventType, req);
            const clientGeneric = new client_1.ClientGeneric(req, res, manager, config);
            for (const componentName of Object.keys(manager.listeners[eventType])) {
                event.client = new client_1.Client(componentName, clientGeneric);
                manager.listeners[eventType][componentName].forEach((fn) => fn(event));
            }
        }
        return res.end(JSON.stringify(res.payload));
    };
    const handleClientEvent = (req, res) => {
        res.payload = getDefaultPayload();
        const event = new manager_1.MCEvent(req.body.payload.event, req);
        const clientGeneric = new client_1.ClientGeneric(req, res, manager, config);
        const clientComponentNames = Object.entries(clientGeneric.webcmPrefs.listeners)
            .filter(([, events]) => events.includes(req.body.payload.event))
            .map(([componentName]) => componentName);
        for (const component of clientComponentNames) {
            event.client = new client_1.Client(component, clientGeneric);
            try {
                manager.clientListeners[req.body.payload.event + '__' + component](event);
            }
            catch {
                console.error(`Error dispatching ${req.body.payload.event} to ${component}: it isn't registered`);
            }
        }
        res.end(JSON.stringify(res.payload));
    };
    // 'event', 'ecommerce' 'pageview', 'client' are the standard types
    // 'remarketing', 'identify' or any other event type
    const handleTrack = (req, res) => {
        const eventType = req.body.eventType;
        if (eventType === 'client') {
            return handleClientEvent(req, res);
        }
        else {
            return handleEvent(eventType, req, res);
        }
    };
    const handleRequest = (req, clientGeneric) => {
        if (!manager.listeners['request'])
            return;
        const requestEvent = new manager_1.MCEvent('request', req);
        if (!clientGeneric.cookies.get('webcm_prefs')) {
            for (const componentName of Object.keys(manager.listeners['clientcreated'])) {
                const event = new manager_1.MCEvent('clientcreated', req);
                event.client = new client_1.Client(componentName, clientGeneric);
                manager.listeners['clientcreated'][componentName]?.forEach((fn) => fn(event));
            }
        }
        for (const componentName of Object.keys(manager.listeners['request'])) {
            requestEvent.client = new client_1.Client(componentName, clientGeneric);
            manager.listeners['request'][componentName]?.forEach((fn) => fn(requestEvent));
        }
    };
    const handleResponse = (req, clientGeneric) => {
        if (!manager.listeners['response'])
            return;
        const responseEvent = new manager_1.MCEvent('response', req);
        for (const componentName of Object.keys(manager.listeners['response'])) {
            responseEvent.client = new client_1.Client(componentName, clientGeneric);
            manager.listeners['response'][componentName]?.forEach((fn) => fn(responseEvent));
        }
    };
    const app = (0, express_1.default)().use(express_1.default.json());
    app.set('trust proxy', true);
    // Mount WebCM endpoint
    app.post(trackPath, handleTrack);
    // Mount components endpoints
    for (const route of Object.keys(manager.mappedEndpoints)) {
        app.all(route, async (req, res) => {
            const response = await manager.mappedEndpoints[route](req);
            for (const [headerName, headerValue] of response.headers.entries()) {
                res.set(headerName, headerValue);
            }
            res.status(response.status);
            let isDone = false;
            const reader = response.body?.getReader();
            while (!isDone && reader) {
                const { value, done } = await reader.read();
                if (value)
                    res.send(Buffer.from(value));
                isDone = done;
            }
            res.end();
        });
    }
    // Mount components proxied endpoints
    for (const component of Object.keys(manager.proxiedEndpoints)) {
        for (const [path, proxyTarget] of Object.entries(manager.proxiedEndpoints[component])) {
            const proxyEndpoint = '/webcm/' + component + path;
            app.all(proxyEndpoint, async (req, res, next) => {
                const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)({
                    target: proxyTarget + req.path.slice(proxyEndpoint.length - 2),
                    ignorePath: true,
                    followRedirects: true,
                });
                proxy(req, res, next);
            });
        }
    }
    // Mount static files
    for (const [path, fileTarget] of Object.entries(manager.staticFiles)) {
        app.use(path, express_1.default.static(fs_path.join(componentsPath, fileTarget)));
    }
    // Listen to all normal requests
    app.use('**', (req, res, next) => {
        res.payload = getDefaultPayload();
        const clientGeneric = new client_1.ClientGeneric(req, res, manager, config);
        const proxySettings = {
            target,
            changeOrigin: true,
            selfHandleResponse: true,
            onProxyReq: (_proxyReq, req, _res) => {
                handleRequest(req, clientGeneric);
            },
            onProxyRes: (0, http_proxy_middleware_1.responseInterceptor)(async (responseBuffer, _proxyRes, proxyReq, _res) => {
                handleResponse(proxyReq, clientGeneric);
                if (proxyReq.headers['accept']?.toLowerCase().includes('text/html')) {
                    let response = responseBuffer.toString('utf8');
                    response = await manager.processEmbeds(response);
                    response = await manager.processWidgets(response);
                    return response.replace('<head>', `<head><script>${manager.getInjectedScript(clientGeneric)};webcm._processServerResponse(${JSON.stringify(res.payload)})</script>`);
                }
                return responseBuffer;
            }),
        };
        const proxy = (0, http_proxy_middleware_1.createProxyMiddleware)(proxySettings);
        proxy(req, res, next);
    });
    console.info('\nWebCM, version', process.env.npm_package_version || package_json_1.version);
    app.listen(port, hostname);
    console.info(`\n🚀 WebCM is now proxying ${target} at http://${hostname}:${port}\n\n`);
};
exports.startServer = startServer;
