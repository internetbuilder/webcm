"use strict";
const webcm = {
    pageVars: {},
    _processServerResponse: async (res) => {
        const data = res.json ? await res.json() : res;
        for (const [url, opts] of data.fetch)
            fetch(url, opts);
        for (const [key, val] of data.pageVars)
            webcm.pageVars[key] = val;
        for (const e of data.execute)
            eval(e);
        return data.return;
    },
    track: async (eventType, payload) => {
        const data = {
            payload,
            location: window.location,
            title: document.title,
            pageVars: webcm.pageVars,
            timestamp: new Date().getTime(),
            offset: new Date().getTimezoneOffset(),
            eventType,
        };
        const res = await fetch('TRACK_PATH', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        return webcm._processServerResponse(res);
    },
    _syncedAttributes: [
        'altKey',
        'clientX',
        'clientY',
        'pageX',
        'pageY',
        'button',
    ],
};
webcm.track('pageview');
