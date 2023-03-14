"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
describe('Cache', () => {
    it('caches and invalidates as expected', async () => {
        const getLunch = (who) => (who === 'mouse' ? 'cheese' : 'dust');
        let lunch = await (0, index_1.useCache)('cheese', () => getLunch('mouse'));
        lunch = await (0, index_1.useCache)('cheese', () => getLunch('not mouse'));
        expect(lunch).toEqual('cheese');
        (0, index_1.invalidateCache)('cheese');
        lunch = await (0, index_1.useCache)('cheese', () => getLunch('not mouse'));
        expect(lunch).toEqual('dust');
    });
});
