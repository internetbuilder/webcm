"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateCache = exports.useCache = void 0;
/* eslint-disable @typescript-eslint/ban-types */
const cache = {};
const useCache = async (key, callback, expirySeconds = 3600) => {
    const currentTime = new Date().valueOf() / 1000;
    const cached = cache[key];
    if (cached && cached.expiry >= currentTime)
        return cached.value;
    cache[key] = { value: await callback(), expiry: currentTime + expirySeconds };
    return cache[key].value;
};
exports.useCache = useCache;
const invalidateCache = (key) => {
    delete cache[key];
};
exports.invalidateCache = invalidateCache;
