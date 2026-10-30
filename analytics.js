/* Cookieless usage counts through PostHog. Nothing loads until a project key is set, and the PDF never leaves the browser. */
const SpacerAnalytics = (() => {
    const KEY = '';
    const HOST = 'https://us.i.posthog.com';
    const enabled = Boolean(KEY) && navigator.doNotTrack !== '1' && !navigator.globalPrivacyControl;
    const queue = [];
    let client = null;
    const ref = new URLSearchParams(location.search).get('ref') || undefined;
    const send = (event, properties) => client.capture(event, { ref, ...properties });
    function track(event, properties = {}) {
        if (!enabled) return;
        if (client) send(event, properties);
        else queue.push([event, properties]);
    }
    if (enabled) {
        const script = document.createElement('script');
        script.src = 'https://us-assets.i.posthog.com/static/array.js';
        script.async = true;
        script.onload = () => {
            client = window.posthog;
            client.init(KEY, { api_host: HOST, persistence: 'memory', autocapture: false, capture_pageview: true, capture_pageleave: false, disable_session_recording: true, disable_surveys: true, person_profiles: 'never' });
            queue.splice(0).forEach(([event, properties]) => send(event, properties));
        };
        document.head.append(script);
    }
    return { track, enabled };
})();
