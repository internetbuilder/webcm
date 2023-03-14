"use strict";
window.addEventListener('pageHide', ({ persisted }) => {
    webcm.track('client', {
        event: 'pageHide',
        pageHide: [{ persisted, timestamp: new Date().getTime() }],
    });
});
