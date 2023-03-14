"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get = exports.set = void 0;
const fs_1 = require("fs");
const BASE_DIR = 'kv';
const set = (key, value) => {
    (0, fs_1.writeFileSync)(BASE_DIR + '/' + key, JSON.stringify(value));
    return true;
};
exports.set = set;
const get = (key) => {
    return JSON.parse((0, fs_1.readFileSync)(BASE_DIR + '/' + key).toString());
};
exports.get = get;
