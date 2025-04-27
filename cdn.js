(function(window, document) {
  "use strict";

  window.cdp = window.cdp || {};

  var config = {
    endpoint: window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
    batch_events: false,
    batch_size: 10,
    batch_timeout: 2000,
    cookie_expires: 365,
    cross_domain: {
      enabled: false,
      domains: []
    },
    sensitive_data: {
      auto_hash: false,
      patterns: {
        email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        phone: /^\+?[0-9]{10,15}$/
      }
    }
  };

  var state = {
    userId: null,
    anonymousId: generateId(),
    sessionId: generateId(),
    utmParams: {}, // Store UTM parameters
    eventQueue: [], // Store events for batching
    batchTimerId: null // Timer for batch sending
  };

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // Use a synchronous hashing function for SHA-256
  function sha256Sync(str) {
    // This is a JavaScript implementation of SHA-256
    var SHA256 = function(s) {
      var chrsz = 8;
      var hexcase = 0;
      
      function safe_add (x, y) {
        var lsw = (x & 0xFFFF) + (y & 0xFFFF);
        var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
        return (msw << 16) | (lsw & 0xFFFF);
      }
      
      function S (X, n) { return ( X >>> n ) | (X << (32 - n)); }
      function R (X, n) { return ( X >>> n ); }
      function Ch (x, y, z) { return ((x & y) ^ ((~x) & z)); }
      function Maj (x, y, z) { return ((x & y) ^ (x & z) ^ (y & z)); }
      function Sigma0256 (x) { return (S(x, 2) ^ S(x, 13) ^ S(x, 22)); }
      function Sigma1256 (x) { return (S(x, 6) ^ S(x, 11) ^ S(x, 25)); }
      function Gamma0256 (x) { return (S(x, 7) ^ S(x, 18) ^ R(x, 3)); }
      function Gamma1256 (x) { return (S(x, 17) ^ S(x, 19) ^ R(x, 10)); }
      
      function core_sha256 (m, l) {
        var K = [0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5, 0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174, 0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA, 0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967, 0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85, 0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070, 0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3, 0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2];
        var HASH = [0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19];
        var W = new Array(64);
        var a, b, c, d, e, f, g, h;
        var T1, T2;
        
        m[l >> 5] |= 0x80 << (24 - l % 32);
        m[((l + 64 >> 9) << 4) + 15] = l;
        
        for (var i = 0; i < m.length; i += 16) {
          a = HASH[0];
          b = HASH[1];
          c = HASH[2];
          d = HASH[3];
          e = HASH[4];
          f = HASH[5];
          g = HASH[6];
          h = HASH[7];
          
          for (var j = 0; j < 64; j++) {
            if (j < 16) W[j] = m[j + i];
            else W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
            
            T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
            T2 = safe_add(Sigma0256(a), Maj(a, b, c));
            
            h = g;
            g = f;
            f = e;
            e = safe_add(d, T1);
            d = c;
            c = b;
            b = a;
            a = safe_add(T1, T2);
          }
          
          HASH[0] = safe_add(a, HASH[0]);
          HASH[1] = safe_add(b, HASH[1]);
          HASH[2] = safe_add(c, HASH[2]);
          HASH[3] = safe_add(d, HASH[3]);
          HASH[4] = safe_add(e, HASH[4]);
          HASH[5] = safe_add(f, HASH[5]);
          HASH[6] = safe_add(g, HASH[6]);
          HASH[7] = safe_add(h, HASH[7]);
        }
        return HASH;
      }
      
      function str2binb (str) {
        var bin = [];
        var mask = (1 << chrsz) - 1;
        for (var i = 0; i < str.length * chrsz; i += chrsz) {
          bin[i >> 5] |= (str.charCodeAt(i / chrsz) & mask) << (24 - i % 32);
        }
        return bin;
      }
      
      function Utf8Encode(string) {
        string = string.replace(/\r\n/g, '\n');
        var utftext = '';
        
        for (var n = 0; n < string.length; n++) {
          var c = string.charCodeAt(n);
          
          if (c < 128) {
            utftext += String.fromCharCode(c);
          } else if ((c > 127) && (c < 2048)) {
            utftext += String.fromCharCode((c >> 6) | 192);
            utftext += String.fromCharCode((c & 63) | 128);
          } else {
            utftext += String.fromCharCode((c >> 12) | 224);
            utftext += String.fromCharCode(((c >> 6) & 63) | 128);
            utftext += String.fromCharCode((c & 63) | 128);
          }
        }
        
        return utftext;
      }
      
      function binb2hex (binarray) {
        var hex_tab = hexcase ? '0123456789ABCDEF' : '0123456789abcdef';
        var str = '';
        for (var i = 0; i < binarray.length * 4; i++) {
          str += hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8 + 4)) & 0xF) +
          hex_tab.charAt((binarray[i >> 2] >> ((3 - i % 4) * 8)) & 0xF);
        }
        return str;
      }
      
      s = Utf8Encode(s);
      return binb2hex(core_sha256(str2binb(s), s.length * chrsz));
    };
    
    return SHA256(str);
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
  
  function storeUtmParams(utmParams) {
    // Store UTM parameters in sessionStorage specifically
    if (Object.keys(utmParams).length > 0) {
      window.sessionStorage.setItem('cdp_utm_params', JSON.stringify(utmParams));
    }
  }
  
  function getStoredUtmParams() {
    // Get UTM parameters from sessionStorage
    var storedUtms = window.sessionStorage.getItem('cdp_utm_params');
    if (storedUtms) {
      try {
        return JSON.parse(storedUtms);
      } catch (e) {
        console.error('CDP: Failed to parse UTM params from sessionStorage', e);
      }
    }
    return {};
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

  function extractUtmParams() {
    var queryParams = new URLSearchParams(window.location.search);
    var utmParams = {};
    var utmTags = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    
    utmTags.forEach(function(tag) {
      if (queryParams.has(tag)) {
        utmParams[tag] = queryParams.get(tag);
      }
    });
    
    // Store UTM params in state if any were found
    if (Object.keys(utmParams).length > 0) {
      state.utmParams = utmParams;
      // Store in sessionStorage specifically for UTMs
      storeUtmParams(utmParams);
    }
    
    return utmParams;
  }

  function getUtmParams() {
    // Return UTM params from state, or try to load from sessionStorage
    if (Object.keys(state.utmParams).length === 0) {
      var storedUtms = getStoredUtmParams();
      if (Object.keys(storedUtms).length > 0) {
        state.utmParams = storedUtms;
      }
    }
    return state.utmParams;
  }

  function detectAndHashSensitiveData(obj) {
    // If auto_hash is disabled, return the original object
    if (!config.sensitive_data.auto_hash) {
      return obj;
    }
    
    // If input isn't an object or is null, return as is
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    // Process arrays recursively
    if (Array.isArray(obj)) {
      return obj.map(item => detectAndHashSensitiveData(item));
    }
    
    // Create new object to avoid modifying the original
    var result = {};
    
    // Iterate through object properties
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        var value = obj[key];
        
        // If value is an object (including arrays), process recursively
        if (value !== null && typeof value === 'object') {
          result[key] = detectAndHashSensitiveData(value);
        }
        // If value is a string, check for sensitive patterns
        else if (typeof value === 'string') {
          // Check if it matches email pattern
          if (config.sensitive_data.patterns.email.test(value)) {
            result[key] = sha256Sync(value);
          }
          // Check if it matches phone pattern
          else if (config.sensitive_data.patterns.phone.test(value)) {
            result[key] = sha256Sync(value);
          }
          // Otherwise keep the original value
          else {
            result[key] = value;
          }
        }
        // For non-strings, keep as is
        else {
          result[key] = value;
        }
      }
    }
    
    return result;
  }

  function syncCrossDomainId() {
    if (!config.cross_domain.enabled || !config.cross_domain.domains.length) return;
    
    try {
      // Create a hidden iframe to sync cookies across domains
      var iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = createSyncUrl();
      document.body.appendChild(iframe);
      
      // Remove iframe after sync attempt
      setTimeout(function() {
        if (iframe && iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 2000);
    } catch (e) {
      console.error('CDP: Cross-domain sync failed', e);
    }
  }
  
  function createSyncUrl() {
    // Find a domain different from current one to sync with
    var currentDomain = window.location.hostname;
    var targetDomain = '';
    
    for (var i = 0; i < config.cross_domain.domains.length; i++) {
      if (config.cross_domain.domains[i] !== currentDomain) {
        targetDomain = config.cross_domain.domains[i];
        break;
      }
    }
    
    if (!targetDomain) return '';
    
    // Create sync URL with user and session IDs
    return 'https://' + targetDomain + '/cdp-sync.html' + 
           '?anonymous_id=' + encodeURIComponent(state.anonymousId) + 
           '&session_id=' + encodeURIComponent(state.sessionId) + 
           (state.userId ? '&user_id=' + encodeURIComponent(state.userId) : '');
  }
  
  function processSyncParams() {
    // Check if the URL has sync parameters
    var params = new URLSearchParams(window.location.search);
    var syncAnonymousId = params.get('anonymous_id');
    var syncSessionId = params.get('session_id');
    var syncUserId = params.get('user_id');
    
    if (syncAnonymousId) {
      state.anonymousId = syncAnonymousId;
      setCookie('cdp_anonymous_id', syncAnonymousId, config.cookie_expires);
    }
    
    if (syncSessionId) {
      state.sessionId = syncSessionId;
      setCookie('cdp_session_id', syncSessionId, config.cookie_expires);
    }
    
    if (syncUserId) {
      state.userId = syncUserId;
      setCookie('cdp_user_id', syncUserId, config.cookie_expires);
    }
  }

  function send(payload) {
    // If batching is enabled, add to queue
    if (config.batch_events) {
      state.eventQueue.push(payload);
      
      // If we've reached batch size, send immediately
      if (state.eventQueue.length >= config.batch_size) {
        sendBatch();
      } else if (!state.batchTimerId) {
        // Otherwise set a timer to send batch after timeout
        state.batchTimerId = setTimeout(sendBatch, config.batch_timeout);
      }
    } else {
      // Otherwise send immediately
      sendSingle(payload);
    }
  }

  function sendBatch() {
    if (state.eventQueue.length === 0) return;
    
    // Clear any existing timer
    if (state.batchTimerId) {
      clearTimeout(state.batchTimerId);
      state.batchTimerId = null;
    }
    
    // Get events to send
    var events = state.eventQueue;
    state.eventQueue = [];
    
    // Create batch payload
    var batchPayload = {
      batch: events,
      sent_at: new Date().toISOString()
    };
    
    var payloadStr = JSON.stringify(batchPayload);
    
    // Send the batch
    if (navigator.sendBeacon) {
      navigator.sendBeacon(config.endpoint, payloadStr);
    } else {
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        keepalive: true
      }).catch(function(e) {
        console.error('CDP: batch send failed', e);
      });
    }
  }
  
  function sendSingle(payload) {
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

    properties = properties || {};

    // Apply automatic sensitive data hashing if enabled
    properties = detectAndHashSensitiveData(properties);

    // Get UTM parameters
    var utmParams = getUtmParams();

    var eventData = {
      event: eventName,
      event_id: generateId(),
      timestamp: now,
      properties: properties,
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

    // Add UTM parameters as a top-level object if they exist
    if (Object.keys(utmParams).length > 0) {
      eventData.utm = utmParams;
    }

    send(eventData);
  }

  function identifyUser(traits) {
    var now = new Date().toISOString();
    traits = traits || {};

    // Apply automatic sensitive data hashing if enabled
    traits = detectAndHashSensitiveData(traits);

    // Get UTM parameters
    var utmParams = getUtmParams();

    var eventData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: now,
      properties: traits,
      user: {
        user_id: traits.user_id || state.userId,
        anonymous_id: state.anonymousId
      },
      session: {
        id: state.sessionId
      },
      sent_at: now
    };

    // Add UTM parameters as a top-level object if they exist
    if (Object.keys(utmParams).length > 0) {
      eventData.utm = utmParams;
    }

    // If user_id is provided, update state and cookie
    if (traits.user_id) {
      state.userId = traits.user_id;
      setCookie('cdp_user_id', traits.user_id, config.cookie_expires);
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
    
    var existingSessionId = getCookie('cdp_session_id');
    if (existingSessionId) {
      state.sessionId = existingSessionId;
    } else {
      setCookie('cdp_session_id', state.sessionId, config.cookie_expires);
    }

    // Extract UTM parameters from URL on initialization
    extractUtmParams();
    
    // Process cross-domain sync parameters if present
    processSyncParams();
    
    // If cross-domain tracking is enabled, sync IDs with other domains
    if (config.cross_domain.enabled) {
      // Delay sync to ensure the page has loaded
      setTimeout(syncCrossDomainId, 1000);
    }
    
    // Set up beforeunload handler to flush any queued events when the page unloads
    window.addEventListener('beforeunload', function() {
      if (state.eventQueue.length > 0) {
        sendBatch();
      }
    });
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
          if (params[0].hasOwnProperty(key)) {
            if (key === 'cross_domain') {
              // Handle cross_domain config object
              if (typeof params[0][key] === 'object') {
                if (params[0][key].hasOwnProperty('enabled')) {
                  config.cross_domain.enabled = !!params[0][key].enabled;
                }
                if (params[0][key].hasOwnProperty('domains') && Array.isArray(params[0][key].domains)) {
                  config.cross_domain.domains = params[0][key].domains;
                }
                // If enabling cross domain with domains, trigger sync
                if (config.cross_domain.enabled && config.cross_domain.domains.length > 0) {
                  syncCrossDomainId();
                }
              }
            } else if (key === 'sensitive_data') {
              // Handle sensitive_data config object
              if (typeof params[0][key] === 'object') {
                if (params[0][key].hasOwnProperty('auto_hash')) {
                  config.sensitive_data.auto_hash = !!params[0][key].auto_hash;
                }
              }
            } else if (config.hasOwnProperty(key)) {
              config[key] = params[0][key];
            }
          }
        }
        break;
      case 'init':
        init(params[0]);
        break;
      case 'hash':
        return sha256Sync(params[0]);
      case 'flushQueue':
        // Force send any queued events
        if (state.eventQueue.length > 0) {
          sendBatch();
        }
        break;
      default:
        console.error('Unknown command:', command);
    }
  };

  // Make hash function available through the cdp object
  window.cdp.hash = sha256Sync;

  // Process any commands that were queued before the script loaded
  for (var i = 0; i < cdpQueue.length; i++) {
    window.cdp.apply(window, cdpQueue[i]);
  }

})(window, document);
