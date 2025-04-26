/**
 * CDP.js - Customer Data Platform JavaScript Library
 * Manual configuration version - you control all tracking
 */

(function(window, document) {
    "use strict";
    
    // Initialize global cdp object if it doesn't exist
    window.cdp = window.cdp || {};
    
    // Configuration with defaults
    var config = {
        endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
        // No project ID required
        debug: window.cdp.debug || false,
        cookie_domain: 'auto',
        cookie_expires: 365, // days
        anonymize_ip: false,
        batch_events: false,  // Set to false to see immediate network requests
        batch_size: 10,
        batch_timeout: 1000, // ms
        // Auto-tracking completely disabled by default
        autoTrack: false,
        trackPageViews: false,
        trackClicks: false,
        trackForms: false
    };
    
    // Internal state
    var state = {
        initialized: true,
        userId: null,
        anonymousId: generateId(),
        sessionId: generateId(),
        eventQueue: []
    };
    
    // Utilities
    function log() {
        if (config.debug && console && console.log) {
            console.log('[CDP]', ...arguments);
        }
    }
    
    function warn() {
        if (config.debug && console && console.warn) {
            console.warn('[CDP]', ...arguments);
        }
    }
    
    function error() {
        if (console && console.error) {
            console.error('[CDP]', ...arguments);
        }
    }
    
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
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }
    
    function setCookie(name, value, days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        var expires = '; expires=' + date.toUTCString();
        document.cookie = name + '=' + value + expires + '; path=/';
    }
    
    function getPageData(overrides) {
        var defaults = {
            title: document.title,
            url: window.location.href,
            path: window.location.pathname,
            referrer: document.referrer,
            search: window.location.search
        };
        
        // Apply any overrides if provided
        if (overrides) {
            for (var key in overrides) {
                if (overrides.hasOwnProperty(key) && defaults.hasOwnProperty(key)) {
                    defaults[key] = overrides[key];
                }
            }
        }
        
        return defaults;
    }
    
    function getClientData() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language || navigator.userLanguage,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            screen: {
                width: window.screen.width,
                height: window.screen.height
            }
        };
    }
    
    // Core functionality
    function applyConfig(options) {
        for (var key in options) {
            if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
                config[key] = options[key];
            }
        }
        log('CDP configuration updated:', config);
    }
    
    function identify(userId, traits) {
        log('Identifying user:', userId, traits);
        
        state.userId = userId;
        setCookie('cdp_user_id', userId, config.cookie_expires);
        
        var identifyEvent = {
            event: 'identify',
            event_id: generateId(),
            timestamp: new Date().toISOString(),
            user: {
                user_id: userId,
                anonymous_id: state.anonymousId
            },
            traits: traits || {}
        };
        
        sendOrQueueEvent(identifyEvent);
        log('User identified:', userId);
    }
    
    function trackEvent(event, properties) {
        log('Tracking event:', event, properties);
        
        // Extract any page or user overrides from properties
        var pageOverrides = properties && properties._page ? properties._page : null;
        var userOverrides = properties && properties._user ? properties._user : null;
        
        // Remove special override properties from the main properties object
        if (properties) {
            if (properties._page) delete properties._page;
            if (properties._user) delete properties._user;
        }
        
        // Prepare event data
        var eventData = {
            event: event,
            event_id: generateId(),
            timestamp: new Date().toISOString(),
            properties: properties || {},
            user: {
                user_id: userOverrides && userOverrides.user_id !== undefined ? userOverrides.user_id : state.userId,
                anonymous_id: userOverrides && userOverrides.anonymous_id !== undefined ? userOverrides.anonymous_id : state.anonymousId
            },
            session: {
                id: state.sessionId
            },
            page: getPageData(pageOverrides),
            client: getClientData()
        };
        
        sendOrQueueEvent(eventData);
        log('Event tracked:', event);
    }
    
    function sendOrQueueEvent(eventData) {
        if (config.batch_events) {
            // Add to queue
            state.eventQueue.push(eventData);
            log('Event added to queue. Queue size:', state.eventQueue.length);
            
            // Process batch if needed
            if (state.eventQueue.length >= config.batch_size) {
                log('Batch size reached, processing batch');
                processBatch();
            } else if (state.eventQueue.length === 1) {
                log('First event in queue, setting timeout for batch processing');
                setTimeout(processBatch, config.batch_timeout);
            }
        } else {
            // Send immediately
            log('Batch mode disabled, sending event immediately');
            sendToServer([eventData]);
        }
    }
    
    function processBatch() {
        if (state.eventQueue.length === 0) {
            log('No events in queue to process');
            return;
        }
        
        var events = state.eventQueue.splice(0, config.batch_size);
        log('Processing batch of', events.length, 'events');
        
        sendToServer(events);
        
        if (state.eventQueue.length > 0) {
            log('Events remaining in queue:', state.eventQueue.length, 'scheduling next batch');
            setTimeout(processBatch, config.batch_timeout);
        }
    }
    
    function sendToServer(events) {
        log('Sending events to server:', events);
        
        var payload = {
            batch: events,
            sent_at: new Date().toISOString()
        };
        
        var payloadStr = JSON.stringify(payload);
        
        // Try using fetch first (modern browsers)
        try {
            fetch(config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: payloadStr
            })
            .then(function(response) {
                if (!response.ok) {
                    throw new Error('Network response was not ok: ' + response.status);
                }
                return response.json();
            })
            .then(function(data) {
                log('Events sent successfully, server response:', data);
            })
            .catch(function(error) {
                error('Error sending events:', error);
                // Try sendBeacon as a fallback for fetch failures
                if (navigator.sendBeacon && navigator.sendBeacon(config.endpoint, payloadStr)) {
                    log('Events sent using navigator.sendBeacon after fetch failure');
                } else {
                    fallbackToXHR(payloadStr);
                }
            });
        } catch (e) {
            // Try sendBeacon if fetch is not available
            if (navigator.sendBeacon && navigator.sendBeacon(config.endpoint, payloadStr)) {
                log('Events sent using navigator.sendBeacon');
            } else {
                // Final fallback to XHR
                fallbackToXHR(payloadStr);
            }
        }
    }
    
    function fallbackToXHR(payloadStr) {
        // Fallback for browsers that don't support fetch or sendBeacon
        var xhr = new XMLHttpRequest();
        xhr.open('POST', config.endpoint, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    log('Events sent successfully via XHR');
                } else {
                    error('XHR Error sending events:', xhr.status, xhr.statusText);
                }
            }
        };
        xhr.onerror = function() {
            error('XHR Network error when sending events');
        };
        xhr.send(payloadStr);
        log('Events sent via XHR (fetch and sendBeacon not available or failed)');
    }
    }
    
    // Setup manual event tracking helpers - all auto-tracking disabled by default
    function setupTracking(options) {
        // Manual setup only - no automatic event tracking
        if (options) {
            applyConfig(options);
        }
        
        log('CDP setup complete - ready for manual event tracking');
        
        // Initialize anonymous ID if needed
        var existingAnonymousId = getCookie('cdp_anonymous_id');
        if (existingAnonymousId) {
            state.anonymousId = existingAnonymousId;
            log('Found existing anonymous ID:', existingAnonymousId);
        } else {
            setCookie('cdp_anonymous_id', state.anonymousId, config.cookie_expires);
            log('Set anonymous ID cookie:', state.anonymousId);
        }
        
        // Check for existing user ID
        var existingUserId = getCookie('cdp_user_id');
        if (existingUserId) {
            state.userId = existingUserId;
            log('Found existing user ID:', existingUserId);
        }
    }
    
    // Define the public API
    var cdpQueue = window.cdp.q || [];
    window.cdp = function() {
        var args = Array.prototype.slice.call(arguments);
        var command = args[0];
        var params = args.slice(1);
        
        log('CDP command:', command, params);
        
        switch (command) {
            case 'track':
                trackEvent(params[0], params[1]);
                break;
            case 'identify':
                identify(params[0], params[1]);
                break;
            case 'config':
                applyConfig(params[0]);
                break;
            case 'setup':
                setupTracking(params[0]);
                break;
            default:
                error('Unknown command:', command);
        }
    };
    
    // Process any queued commands
    log('Processing', cdpQueue.length, 'queued commands');
    for (var i = 0; i < cdpQueue.length; i++) {
        window.cdp.apply(window, cdpQueue[i]);
    }
    
    // Expose the version
    window.cdp.version = '1.1.0';
    
    // Debug helper - expose key objects to window for debugging
    if (config.debug) {
        window._cdpDebug = {
            config: config,
            state: state
        };
    }
    
    // Initialize the library but don't track anything automatically
    setupTracking();
    
    log('CDP library loaded - ready for manual configuration and tracking');
    
})(window, document);
