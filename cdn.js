(function(window, document) {
    "use strict";

    window.cdp = window.cdp || {};

    var config = {
        endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
        debug: window.cdp.debug || false,
        cookie_domain: 'auto',
        cookie_expires: 365,
        anonymize_ip: false,
        batch_events: false,
        batch_size: 10,
        batch_timeout: 1000,
    };

    var state = {
        initialized: true,
        userId: null,
        anonymousId: generateId(),
        sessionId: generateId(),
        eventQueue: []
    };

    function log() { if (config.debug && console && console.log) console.log('[CDP]', ...arguments); }
    function warn() { if (config.debug && console && console.warn) console.warn('[CDP]', ...arguments); }
    function error() { if (console && console.error) console.error('[CDP]', ...arguments); }

    function generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            var v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getCookie(name) {
        var value = '; ' + document.cookie;
        var parts = value.split('; ' + name + '=');
        return parts.length === 2 ? parts.pop().split(';').shift() : null;
    }

    function setCookie(name, value, days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        var expires = "; expires=" + date.toUTCString();
        document.cookie = name + "=" + value + expires + "; path=/";
    }

    function getPageData(overrides) {
        var defaults = {
            title: document.title,
            url: window.location.href,
            path: window.location.pathname,
            referrer: document.referrer,
            search: window.location.search
        };
        if (overrides) {
            for (var key in overrides) {
                if (defaults.hasOwnProperty(key)) defaults[key] = overrides[key];
            }
        }
        return defaults;
    }

    function getClientData() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language || navigator.userLanguage,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            screen: { width: window.screen.width, height: window.screen.height }
        };
    }

    function applyConfig(options) {
        for (var key in options) {
            if (config.hasOwnProperty(key)) config[key] = options[key];
        }
        log('CDP configuration updated:', config);
    }

    function identify(traits) {
        log('Identifying user with traits:', traits);

        var identifyEvent = {
            event: 'identify',
            event_id: generateId(),
            timestamp: new Date().toISOString(),
            user: {
                user_id: state.userId || null,    // ✅ Now uses internal userId
                anonymous_id: state.anonymousId
            },
            traits: traits || {}
        };

        sendOrQueueEvent(identifyEvent);
    }

    function trackEvent(event, properties) {
        log('Tracking event:', event, properties);

        var pageOverrides = properties && properties._page ? properties._page : null;
        var userOverrides = properties && properties._user ? properties._user : null;

        if (properties) {
            if (properties._page) delete properties._page;
            if (properties._user) delete properties._user;
        }

        var eventData = {
            event: event,
            event_id: generateId(),
            timestamp: new Date().toISOString(),
            properties: properties || {},
            user: {
                user_id: userOverrides?.user_id || state.userId,
                anonymous_id: userOverrides?.anonymous_id || state.anonymousId
            },
            session: { id: state.sessionId },
            page: getPageData(pageOverrides),
            client: getClientData()
        };

        sendOrQueueEvent(eventData);
    }

    function sendOrQueueEvent(eventData) {
        if (config.batch_events) {
            state.eventQueue.push(eventData);
            if (state.eventQueue.length >= config.batch_size) processBatch();
            else if (state.eventQueue.length === 1) setTimeout(processBatch, config.batch_timeout);
        } else {
            sendToServer([eventData]);
        }
    }

    function processBatch() {
        if (state.eventQueue.length === 0) return;
        var events = state.eventQueue.splice(0, config.batch_size);
        sendToServer(events);
        if (state.eventQueue.length > 0) setTimeout(processBatch, config.batch_timeout);
    }

    function sendToServer(events) {
        var payload = { batch: events, sent_at: new Date().toISOString() };
        var payloadStr = JSON.stringify(payload);

        try {
            fetch(config.endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payloadStr
            }).then(function(response) {
                if (!response.ok) throw new Error('Network error: ' + response.status);
                return response.json();
            }).then(function(data) {
                log('Events sent successfully:', data);
            }).catch(function(err) {
                error('Fetch error:', err);
                fallbackToXHR(payloadStr);
            });
        } catch (e) {
            fallbackToXHR(payloadStr);
        }
    }

    function fallbackToXHR(payloadStr) {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', config.endpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    log('Events sent successfully via XHR');
                } else {
                    error('XHR error sending events:', xhr.status, xhr.statusText);
                }
            }
        };
        xhr.onerror = function() { error('XHR network error'); };
        xhr.send(payloadStr);
    }

    function initTracking(options) {
        if (options) applyConfig(options);

        var existingAnonymousId = getCookie('cdp_anonymous_id');
        if (existingAnonymousId) {
            state.anonymousId = existingAnonymousId;
        } else {
            setCookie('cdp_anonymous_id', state.anonymousId, config.cookie_expires);
        }

        var existingUserId = getCookie('cdp_user_id');
        if (existingUserId) {
            state.userId = existingUserId;
        }

        log('CDP initialization complete');
    }

    var cdpQueue = window.cdp.q || [];
    window.cdp = function() {
        var args = Array.prototype.slice.call(arguments);
        var command = args[0];
        var params = args.slice(1);

        switch (command) {
            case 'track':
                trackEvent(params[0], params[1]);
                break;
            case 'identify':
                identify(params[0]);  // ✅ Only traits passed
                break;
            case 'config':
                applyConfig(params[0]);
                break;
            case 'init':
                initTracking(params[0]);
                break;
            default:
                error('Unknown command:', command);
        }
    };

    for (var i = 0; i < cdpQueue.length; i++) {
        window.cdp.apply(window, cdpQueue[i]);
    }

    window.cdp.version = '1.1.0';

})(window, document);
