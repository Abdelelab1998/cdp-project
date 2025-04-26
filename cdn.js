/**
 * CDP.js - Customer Data Platform JavaScript Library
 * This script handles collecting and sending events to your CDP server
 */

(function(window, document) {
    "use strict";
    
    // Configuration with defaults
    var config = {
        endpoint: 'https://your-server-endpoint.com/collect',
        projectId: null,
        debug: false,
        cookie_domain: 'auto',
        cookie_expires: 365, // days
        anonymize_ip: false,
        batch_events: false,  // Set to false to see immediate network requests
        batch_size: 10,
        batch_timeout: 1000, // ms
        autoTrack: false,     // Disabled by default
        trackPageViews: false,
        trackClicks: false,
        trackForms: false
    };
    
    // Internal state
    var state = {
        initialized: false,
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
    
    function getPageData() {
        return {
            title: document.title,
            url: window.location.href,
            path: window.location.pathname,
            referrer: document.referrer,
            search: window.location.search
        };
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
    function initialize(projectId, options) {
        log('Initializing CDP with project ID:', projectId);
        
        if (state.initialized) {
            warn('CDP already initialized.');
            return;
        }
        
        // Set project ID
        config.projectId = projectId;
        
        // Apply custom options
        if (options) {
            for (var key in options) {
                if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
                    config[key] = options[key];
                }
            }
        }
        
        log('Configuration:', config);
        
        // Check for existing user ID
        var existingUserId = getCookie('cdp_user_id');
        if (existingUserId) {
            state.userId = existingUserId;
            log('Found existing user ID:', existingUserId);
        } else {
            setCookie('cdp_anonymous_id', state.anonymousId, config.cookie_expires);
            log('Set anonymous ID cookie:', state.anonymousId);
        }
        
        // Mark as initialized
        state.initialized = true;
        
        // Automatic page view tracking
        if (config.autoTrack && config.trackPageViews) {
            log('Auto-tracking page view');
            trackEvent('page_view', {
                title: document.title,
                url: window.location.href,
                referrer: document.referrer
            });
        }
        
        log('CDP initialized successfully');
    }
    
    function applyConfig(options) {
        for (var key in options) {
            if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
                config[key] = options[key];
            }
        }
        log('CDP configuration updated:', config);
    }
    
    function identify(userId, traits) {
        if (!state.initialized) {
            warn('CDP not initialized yet. Call cdp("init", "YOUR_PROJECT_ID") first.');
            return;
        }
        
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
        if (!state.initialized) {
            warn('CDP not initialized yet. Call cdp("init", "YOUR_PROJECT_ID") first.');
            return;
        }
        
        log('Tracking event:', event, properties);
        
        // Prepare event data
        var eventData = {
            event: event,
            event_id: generateId(),
            timestamp: new Date().toISOString(),
            properties: properties || {},
            user: {
                user_id: state.userId,
                anonymous_id: state.anonymousId
            },
            session: {
                id: state.sessionId
            },
            page: getPageData(),
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
            project_id: config.projectId,
            batch: events,
            sent_at: new Date().toISOString()
        };
        
        // Using standard fetch API for modern browsers
        try {
            fetch(config.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
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
                // Could implement retry logic here
            });
        } catch (e) {
            // Fallback for browsers that don't support fetch
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
            xhr.send(JSON.stringify(payload));
            log('Events sent via XHR (fetch not available)');
        }
    }
    
    // Set up event listeners if auto-tracking is enabled
    function setupAutoTracking() {
        if (!config.autoTrack) {
            log('Auto-tracking disabled');
            return;
        }
        
        if (config.trackClicks) {
            log('Setting up click tracking');
            document.addEventListener('click', function(e) {
                var target = e.target;
                while (target && target.tagName !== 'A') {
                    target = target.parentNode;
                    if (!target) return;
                }
                
                if (target.hostname !== window.location.hostname) {
                    trackEvent('outbound_link_click', {
                        url: target.href,
                        text: target.innerText || target.textContent
                    });
                    log('Tracked outbound link click:', target.href);
                }
            });
        }
        
        if (config.trackForms) {
            log('Setting up form tracking');
            document.addEventListener('submit', function(e) {
                var form = e.target;
                trackEvent('form_submit', {
                    form_id: form.id,
                    form_name: form.name,
                    form_action: form.action
                });
                log('Tracked form submission:', form.id || form.name);
            });
        }
    }
    
    // Initialize auto-tracking
    if (document.readyState === 'complete') {
        setupAutoTracking();
    } else {
        window.addEventListener('load', setupAutoTracking);
    }
    
    // Define the public API
    var cdpQueue = window.cdp.q || [];
    window.cdp = function() {
        var args = Array.prototype.slice.call(arguments);
        var command = args[0];
        var params = args.slice(1);
        
        log('CDP command:', command, params);
        
        switch (command) {
            case 'init':
                initialize(params[0], params[1]);
                break;
            case 'track':
                trackEvent(params[0], params[1]);
                break;
            case 'identify':
                identify(params[0], params[1]);
                break;
            case 'config':
                applyConfig(params[0]);
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
    window.cdp.version = '1.0.0';
    
    // Debug helper - expose key objects to window for debugging
    if (config.debug) {
        window._cdpDebug = {
            config: config,
            state: state
        };
    }
    
})(window, document);
