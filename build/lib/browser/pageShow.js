"use strict";
window.addEventListener('pageShow', ({ persisted }) => {
    webcm.track('client', {
        event: 'pageShow',
        pageShow: [{ persisted, timestamp: new Date().getTime() }],
    }, 1);
});
