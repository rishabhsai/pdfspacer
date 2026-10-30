/* Cookieless usage counts through PostHog. Nothing loads until a project key is set, and the PDF never leaves the browser. */
window.SpacerAnalytics = (() => {
    const KEY = 'phc_mGZF2M9DeZQH8VMTKjTCWS9atYfveUFU8gfsecDMq79F';
    // Same-origin path proxied to PostHog by vercel.json, so list-based blockers do not drop the counts.
    const HOST = '/ingest';
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
        script.src = '/ingest/static/array.js';
        script.async = true;
        script.onload = () => {
            client = window.posthog;
            client.init(KEY, { api_host: HOST, ui_host: 'https://us.posthog.com', persistence: 'memory', autocapture: false, capture_pageview: true, capture_pageleave: false, disable_session_recording: true, disable_surveys: true, capture_dead_clicks: false, capture_performance: false, person_profiles: 'never' });
            queue.splice(0).forEach(([event, properties]) => send(event, properties));
        };
        document.head.append(script);
    }
    return { track, enabled };
})();
