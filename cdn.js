(function(window, document) {
  "use strict";

  window.cdp = window.cdp || {};

  var config = {
    endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
    batch_events: false,
    cookie_expires: 365,
    sensitive_data: false, // New config to auto-hash email/phone
    anonymize_ip: false,   // New config to anonymize IP
  };

  var state = {
    userId: null,
    anonymousId: generateId(),
    sessionId: generateId(),
    utms: {}
  };

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

  function extractUTMs() {
    var params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function(k) {
      if (params.get(k)) {
        state.utms[k] = params.get(k).toLowerCase().trim();
      }
    });
  }

  function sanitizeSensitive(data) {
    var sensitiveKeys = [/email/i, /e-mail/i, /phone/i, /phonenumber/i, /mobile/i, /tel/i];
    for (var key in data) {
      if (data.hasOwnProperty(key)) {
        var value = data[key];
        sensitiveKeys.forEach(function(regex) {
          if (regex.test(key) && typeof value === 'string') {
            if (/email/i.test(key)) {
              value = value.toLowerCase().trim();
            }
            data[key] = hash(value);
          }
        });
      }
    }
    return data;
  }

  function send(payload) {
    if (config.anonymize_ip) {
      payload.anonymous_ip = true;
    }
    if (Object.keys(state.utms).length > 0) {
      payload.utms = state.utms;
    }
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

    send(eventData);
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();
    traits = traits || {};

    if (config.sensitive_data) {
      traits = sanitizeSensitive(traits);
    }

    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: now,
      properties: traits,
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

    extractUTMs();

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
  }

  function simpleHash(str) {
    var hash = 0, i, chr;
    if (str.length === 0) return hash;
    for (i = 0; i < str.length; i++) {
      chr = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + chr;
      hash |= 0;
    }
    return 'hashed_' + Math.abs(hash);
  }

  window.hash = function(data) {
    return simpleHash(data.toString());
  };

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
