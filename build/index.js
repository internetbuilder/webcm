"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const yargs_1 = __importDefault(require("yargs/yargs"));
const server_1 = require("./lib/server");
const crypto_1 = __importDefault(require("crypto"));
globalThis.crypto = crypto_1.default.webcrypto;
const cliArgs = (0, yargs_1.default)(process.argv.slice(2))
    .options({
    config: {
        alias: 'c',
        type: 'string',
        default: './webcm.config.ts',
        describe: 'path to your Managed Components config',
    },
    components: {
        alias: 'mc',
        type: 'string',
        default: './components',
        describe: 'path to Managed Components folder',
    },
})
    .parseSync();
(0, server_1.startServer)(cliArgs.config, cliArgs.components);
