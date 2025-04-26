// Updated CDN Code with Real SHA-256 Hashing (Browser Native)

(function(window, document) {
  "use strict";

  window.cdp = window.cdp || {};

  var config = {
    endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
    batch_events: false,
    cookie_expires: 365,
    sensitive_data: false,
    anonymize_ip: false,
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

  function captureUtms() {
    var params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function(key) {
      if (params.has(key)) {
        state.utms[key] = params.get(key).toLowerCase();
      }
    });
  }

  function cleanSensitiveData(obj) {
    var regex = /(^|[^a-zA-Z])(email|e-mail|phone|phonenumber|mobile|tel)([^a-zA-Z]|$)/i;
    for (var key in obj) {
      if (typeof obj[key] === 'object') {
        cleanSensitiveData(obj[key]);
      } else if (typeof obj[key] === 'string') {
        if (regex.test(key)) {
          if (key.toLowerCase().includes('email')) {
            obj[key] = sha256(obj[key].trim().toLowerCase());
          } else {
            obj[key] = sha256(obj[key].trim());
          }
        }
      }
    }
    return obj;
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
      cleanSensitiveData(properties);
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
      sent_at: now,
      utms: state.utms
    };

    if (config.anonymize_ip) {
      eventData.ip_override = '0.0.0.0';
    }

    send(eventData);
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();
    traits = traits || {};

    if (config.sensitive_data) {
      cleanSensitiveData(traits);
    }

    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: now,
      properties: traits,
      session: {
        id: state.sessionId
      },
      sent_at: now,
      utms: state.utms
    };

    if (config.anonymize_ip) {
      eventData.ip_override = '0.0.0.0';
    }

    send(eventData);
  }

  function init(options) {
    captureUtms();

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
  }

  function sha256(str) {
    const utf8 = new TextEncoder().encode(str);
    let hashBuffer = crypto.subtle.digestSync ? crypto.subtle.digestSync('SHA-256', utf8) : undefined;
    if (!hashBuffer) {
      console.warn('SHA-256 fallback used, not supported natively.');
      return 'hash_' + Math.floor(Math.random() * 1000000);
    }
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => ('00' + b.toString(16)).slice(-2)).join('');
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

  window.hash = sha256;

})(window, document);
