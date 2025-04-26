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

  // Your full SHA256 library blended in:
  function sha256(str) {
    var utf8 = unescape(encodeURIComponent(str));
    var words = [];
    for (var i = 0; i < utf8.length; i++) {
      words.push(utf8.charCodeAt(i));
    }
    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a,
        h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
    var k = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,
      0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,
      0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,
      0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,
      0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,
      0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,
      0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,
      0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,
      0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var l = utf8.length * 8;
    utf8 += '\x80';
    while (utf8.length % 64 - 56) utf8 += '\x00';
    utf8 += String.fromCharCode((l >>> 24) & 0xff) + String.fromCharCode((l >>> 16) & 0xff) + String.fromCharCode((l >>> 8) & 0xff) + String.fromCharCode(l & 0xff);
    for (var i = 0; i < utf8.length; i += 64) {
      var w = new Array(64);
      for (var j = 0; j < 64; j++) {
        w[j>>2] |= utf8.charCodeAt(i+j) << (24-(j%4)*8);
      }
      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (var j = 0; j < 64; j++) {
        var t1 = h + (e>>>6^e>>>11^e>>>25) + (e&f^~e&g) + k[j] + w[j]|0;
        var t2 = (a>>>2^a>>>13^a>>>22) + (a&b^a&c^b&c);
        h=g;g=f;f=e;e=d+t1|0;d=c;c=b;b=a;a=t1+t2|0;
      }
      h0=h0+a|0;h1=h1+b|0;h2=h2+c|0;h3=h3+d|0;
      h4=h4+e|0;h5=h5+f|0;h6=h6+g|0;h7=h7+h|0;
    }
    return [h0,h1,h2,h3,h4,h5,h6,h7].map(function(i){return ('00000000'+(i>>>0).toString(16)).slice(-8);}).join('');
  }

  function hash(value) {
    if (!value || typeof value !== 'string') return value;
    return sha256(value.trim().toLowerCase());
  }

  window.hash = hash;

  function sanitizeSensitiveFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        var lowerKey = key.toLowerCase();
        var value = obj[key];
        if (typeof value === 'string') {
          if (lowerKey.includes('email') && /\S+@\S+\.\S+/.test(value)) {
            obj[key] = hash(value);
          } else if (
            lowerKey.includes('phone') ||
            lowerKey.includes('mobile') ||
            lowerKey.includes('tel')
          ) {
            obj[key] = hash(value);
          }
        } else if (typeof value === 'object') {
          sanitizeSensitiveFields(value);
        }
      }
    }
    return obj;
  }

  function extractUTMs() {
    try {
      var params = new URLSearchParams(window.location.search);
      params.forEach(function(value, key) {
        var lowerKey = key.toLowerCase();
        if (lowerKey.startsWith('utm_')) {
          state.utms[lowerKey] = value.trim();
        }
      });
    } catch(e) {}
  }

  function attachUTMs(properties) {
    if (!properties) properties = {};
    for (var key in state.utms) {
      if (state.utms.hasOwnProperty(key)) {
        properties[key] = state.utms[key];
      }
    }
    return properties;
  }

  function send(payload) {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.endpoint, JSON.stringify(payload));
    } else {
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
      properties: attachUTMs(properties || {}),
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

    if (config.sensitive_data) {
      sanitizeSensitiveFields(eventData.properties);
    }

    if (config.anonymize_ip) {
      eventData.ip = "0.0.0.0";
    }

    send(eventData);
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();
    traits = traits || {};

    if (config.sensitive_data) {
      sanitizeSensitiveFields(traits);
    }

    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: now,
      properties: traits,
      user: {
        user_id: state.userId,
        anonymous_id: state.anonymousId
      },
      session: {
        id: state.sessionId
      },
      client: getClientData(),
      sent_at: now
    };

    if (config.anonymize_ip) {
      eventData.ip = "0.0.0.0";
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

    extractUTMs();
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
