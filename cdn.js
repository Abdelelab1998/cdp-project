(function(window, document) {
  "use strict";

  window.cdp = window.cdp || {};

  var config = {
    endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
    batch_events: false,
    cookie_expires: 365,
    anonymize_ip: false,
    sensitive_data: false,
  };

  var state = {
    userId: null,
    anonymousId: generateId(),
    sessionId: generateId(),
    utms: {} // Store UTM params
  };

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function sha256(str) {
    var utf8 = new TextEncoder().encode(str.toLowerCase().trim());
    return crypto.subtle.digest('SHA-256', utf8).then(function(buffer) {
      var hashArray = Array.from(new Uint8Array(buffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
  }

  window.hash = function(input) {
    input = (input || '').toLowerCase().trim();
    return sha256(input);
  };

  function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length === 2) return parts.pop().split(";").shift();
    return null;
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

  function sanitizeSensitive(data) {
    for (var key in data) {
      if (!data.hasOwnProperty(key)) continue;
      var lower = key.toLowerCase();
      if ((lower.includes('email') || lower.includes('e-mail')) && data[key]) {
        data[key] = sha256(data[key]);
      }
      if ((lower.includes('phone') || lower.includes('mobile') || lower.includes('tel')) && data[key]) {
        data[key] = sha256(data[key]);
      }
    }
    return data;
  }

  function getUTMs() {
    var stored = sessionStorage.getItem('cdp_utms');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {}
    }
    return {};
  }

  function send(payload) {
    var payloadStr = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.endpoint, payloadStr);
    } else {
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        keepalive: true
      }).catch(function(e) {
        console.error('CDP: send failed', e);
      });
    }
  }

  function trackEvent(eventName, properties) {
    var now = new Date().toISOString();
    var pageOverrides = properties && properties._page ? properties._page : null;
    var userOverrides = properties && properties._user ? properties._user : null;

    if (properties) {
      delete properties._page;
      delete properties._user;
    }

    if (config.sensitive_data) {
      properties = sanitizeSensitive(properties);
    }

    var eventData = {
      event: eventName,
      event_id: generateId(),
      timestamp: now,
      properties: properties || {},
      utm: state.utms || {},
      user: {
        user_id: userOverrides && userOverrides.user_id ? userOverrides.user_id : state.userId,
        anonymous_id: state.anonymousId
      },
      session: {
        id: state.sessionId
      },
      page: getPageData(pageOverrides),
      client: getClientData(),
      sent_at: now
    };

    if (config.anonymize_ip) {
      eventData.client.ip = '0.0.0.0';
    }

    send(eventData);
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();

    if (config.sensitive_data) {
      traits = sanitizeSensitive(traits);
    }

    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: now,
      properties: traits || {},
      session: {
        id: state.sessionId
      },
      sent_at: now
    };

    send(eventData);
  }

  function init(options) {
    if (options) {
      for (var key in options) {
        if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
          config[key] = options[key];
        }
      }
    }

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

    state.utms = getUTMs();
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
        identifyUser(params[0]);
        break;
      case 'config':
        for (var key in params[0]) {
          if (params[0].hasOwnProperty(key) && config.hasOwnProperty(key)) {
            config[key] = params[0][key];
          }
        }
        break;
      case 'init':
        init(params[0]);
        break;
      default:
        console.error('Unknown command:', command);
    }
  };

  for (var i = 0; i < cdpQueue.length; i++) {
    window.cdp.apply(window, cdpQueue[i]);
  }

})(window, document);
