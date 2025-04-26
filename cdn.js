(function(window, document) {
  "use strict";

  window.cdp = window.cdp || {};

  var config = {
    endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
    batch_events: false,
    cookie_expires: 365,
    sensitive_data: false,
    anonymize_ip: false
  };

  var state = {
    userId: null,
    anonymousId: generateId(),
    sessionId: generateId(),
    utmParams: {}
  };

  // UTM keys
  var utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  // Regex patterns
  var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  var phoneRegex = /^[\d\s+\-().]{6,20}$/i;

  // Capture UTMs from URL
  captureUTMs();

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

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

  function captureUTMs() {
    var params = new URLSearchParams(window.location.search);
    utmKeys.forEach(function(key) {
      if (params.has(key)) {
        var value = params.get(key);
        if (value) {
          state.utmParams[key] = value.toLowerCase();
          sessionStorage.setItem('cdp_' + key, value.toLowerCase());
        }
      }
    });
    // Also restore from session if no new UTMs
    utmKeys.forEach(function(key) {
      if (!state.utmParams[key]) {
        var stored = sessionStorage.getItem('cdp_' + key);
        if (stored) state.utmParams[key] = stored;
      }
    });
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

  // Manual fast SHA256 wrapper (no await needed)
  async function cryptoHash(value) {
    const encoder = new TextEncoder();
    const data = encoder.encode(value.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  window.hash = function(value) {
    var id = "hash_" + generateId().slice(0,6);
    cryptoHash(value).then(function(result) {
      sessionStorage.setItem(id, result);
    });
    return id;
  };

  function getHashedValue(id) {
    return sessionStorage.getItem(id) || id;
  }

  function sanitizeProperties(properties) {
    var cleanProps = {};

    for (var key in properties) {
      if (!properties.hasOwnProperty(key)) continue;

      var value = properties[key];

      if (typeof value === 'string') {
        value = value.trim();
        if (config.sensitive_data) {
          if (emailRegex.test(value)) value = getHashedValue(hash(value));
          if (phoneRegex.test(value)) value = getHashedValue(hash(value));
        }
      }

      cleanProps[key] = value;
    }

    // Attach UTMs if available
    if (Object.keys(state.utmParams).length > 0) {
      cleanProps.utm = state.utmParams;
    }

    return cleanProps;
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

    var eventData = {
      event: eventName,
      event_id: generateId(),
      timestamp: now,
      properties: sanitizeProperties(properties || {}),
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
      eventData.ip_override = "0.0.0.0";
    }

    send(eventData);
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();
    traits = traits || {};

    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: now,
      properties: sanitizeProperties(traits),
      session: {
        id: state.sessionId
      },
      sent_at: now
    };

    if (config.anonymize_ip) {
      eventData.ip_override = "0.0.0.0";
    }

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

    var existingAnonymousId = sessionStorage.getItem('cdp_anonymous_id');
    if (existingAnonymousId) {
      state.anonymousId = existingAnonymousId;
    } else {
      sessionStorage.setItem('cdp_anonymous_id', state.anonymousId);
    }

    var existingUserId = sessionStorage.getItem('cdp_user_id');
    if (existingUserId) {
      state.userId = existingUserId;
    }
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
