document.addEventListener('visibilitychange', _ => {
  webcm.track('client', {
    event: 'visibilityChange',
    visibilityChange: [
      { state: document.visibilityState, timestamp: new Date().getTime() },
    ],
  })
})
