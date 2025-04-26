(function(window, document) {
  "use strict";

  var config = {
    endpoint: window.cdp?.endpoint || 'https://your-cdp-endpoint.com/collect',
    batch_events: false, // No batching by default
    batch_size: 10,
    batch_timeout: 1000,
    cookie_expires: 365,
    debug: false
  };

  var state = {
    anonymousId: generateId(),
    sessionId: generateId(),
    eventQueue: []
  };

  function log() {
    if (config.debug) console.log('[CDP]', ...arguments);
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
    date.setTime(date.getTime() + (days * 86400000));
    document.cookie = name + '=' + value + '; expires=' + date.toUTCString() + '; path=/';
  }

  function getPageData(overrides) {
    var base = {
      title: document.title,
      url: window.location.href,
      path: window.location.pathname,
      referrer: document.referrer,
      search: window.location.search
    };
    if (overrides) {
      for (var key in overrides) base[key] = overrides[key];
    }
    return base;
  }

  function getClientData() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
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

  function send(payload) {
    var json = JSON.stringify({
      event_name: payload.event,
      data: [payload],
      sent_at: new Date().toISOString()
    });

    if (navigator.sendBeacon) {
      var blob = new Blob([json], { type: 'application/json' });
      if (navigator.sendBeacon(config.endpoint, blob)) {
        log('Sent via sendBeacon');
        return;
      }
    }

    fetch(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true
    }).then(r => log('Sent via fetch')).catch(err => console.error('Fetch error:', err));
  }

  function identify(traits) {
    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: new Date().toISOString(),
      properties: {},
      user: {
        anonymous_id: state.anonymousId,
        ...traits
      },
      session: { id: state.sessionId },
      page: getPageData(),
      client: getClientData()
    };

    send(eventData);
  }

  function track(event, properties) {
    var pageOverrides = properties && properties._page ? properties._page : null;
    var userOverrides = properties && properties._user ? properties._user : null;

    if (properties) {
      delete properties._page;
      delete properties._user;
    }

    var eventData = {
      event: event,
      event_id: generateId(),
      timestamp: new Date().toISOString(),
      properties: properties || {},
      user: {
        anonymous_id: state.anonymousId,
        ...(userOverrides || {})
      },
      session: { id: state.sessionId },
      page: getPageData(pageOverrides),
      client: getClientData()
    };

    send(eventData);
  }

  function init(options) {
    if (options) {
      for (var key in options) {
        if (options.hasOwnProperty(key)) {
          config[key] = options[key];
        }
      }
    }

    var existingAnon = getCookie('cdp_anonymous_id');
    if (existingAnon) {
      state.anonymousId = existingAnon;
    } else {
      setCookie('cdp_anonymous_id', state.anonymousId, config.cookie_expires);
    }

    log('CDP initialized', config);
  }

  // Initialize API
  var cdpQueue = window.cdp.q || [];
  window.cdp = function() {
    var args = Array.prototype.slice.call(arguments);
    var cmd = args[0];
    var params = args.slice(1);

    switch (cmd) {
      case 'track':
        track(params[0], params[1]);
        break;
      case 'identify':
        identify(params[0]);
        break;
      case 'init':
        init(params[0]);
        break;
      case 'config':
        init(params[0]);
        break;
      default:
        console.error('Unknown CDP command:', cmd);
    }
  };

  for (var i = 0; i < cdpQueue.length; i++) {
    window.cdp.apply(window, cdpQueue[i]);
  }

  window.cdp.version = '2.0.0';

})(window, document);
