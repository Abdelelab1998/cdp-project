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

  function hash(value) {
    if (!value) return value;
    const encoder = new TextEncoder();
    const data = encoder.encode(value.toLowerCase().trim());
    return crypto.subtle.digest('SHA-256', data).then((hashBuffer) => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
  }

  function sanitizeSensitive(data) {
    if (!config.sensitive_data) return Promise.resolve(data);
    var cloned = JSON.parse(JSON.stringify(data));

    function traverse(obj) {
      for (var key in obj) {
        if (!obj.hasOwnProperty(key)) continue;
        var val = obj[key];
        if (val && typeof val === 'object') {
          traverse(val);
        } else if (typeof val === 'string') {
          if (/@/.test(val)) { // likely email
            obj[key] = '[hashing]';
            hash(val).then(h => obj[key] = h);
          } else if (/^[\d\+\-\(\) ]{7,}$/.test(val)) { // likely phone
            obj[key] = '[hashing]';
            hash(val).then(h => obj[key] = h);
          }
        }
      }
    }

    traverse(cloned);
    return new Promise(resolve => {
      setTimeout(() => resolve(cloned), 10); // let async hashing apply
    });
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

  function captureUTMs() {
    var params = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function(key) {
      if (params.has(key)) {
        state.utms[key] = params.get(key).toLowerCase();
        sessionStorage.setItem('cdp_' + key, params.get(key).toLowerCase());
      }
    });
  }

  function injectUTMs(properties) {
    var data = Object.assign({}, properties);
    for (var key in state.utms) {
      if (state.utms.hasOwnProperty(key) && !(key in data)) {
        data[key] = state.utms[key];
      }
    }
    return data;
  }

  function trackEvent(eventName, properties) {
    var now = new Date().toISOString();
    var pageOverrides = properties && properties._page ? properties._page : null;
    var userOverrides = properties && properties._user ? properties._user : null;

    if (properties) {
      delete properties._page;
      delete properties._user;
    }

    var baseEvent = {
      event: eventName,
      event_id: generateId(),
      timestamp: now,
      properties: injectUTMs(properties || {}),
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
      baseEvent.client.ip = 'anonymized';
    }

    sanitizeSensitive(baseEvent).then(final => {
      send(final);
    });
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();
    traits = traits || {};

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

    sanitizeSensitive(eventData).then(final => {
      send(final);
    });
  }

  function init(options) {
    if (options) {
      for (var key in options) {
        if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
          config[key] = options[key];
        }
      }
    }

    captureUTMs();

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
      case 'hash':
        return hash(params[0]);
      default:
        console.error('Unknown command:', command);
    }
  };

  for (var i = 0; i < cdpQueue.length; i++) {
    window.cdp.apply(window, cdpQueue[i]);
  }

})(window, document);
