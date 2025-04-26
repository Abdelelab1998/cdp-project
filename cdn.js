(function(window, document) {
  "use strict";

  var config = {
    endpoint: window.cdp && window.cdp.endpoint || 'https://your-server-endpoint.com/collect',
    batch_events: false,
    batch_size: 10,
    batch_timeout: 1000,
    cookie_expires: 365
  };

  var state = {
    userId: null,
    anonymousId: generateId(),
    sessionId: generateId(),
    eventQueue: []
  };

  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
  }

  function setCookie(name, value, days) {
    var d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + '=' + value + '; expires=' + d.toUTCString() + '; path=/';
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
        if (overrides.hasOwnProperty(key)) defaults[key] = overrides[key];
      }
    }
    return defaults;
  }

  function getClientData() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height
      }
    };
  }

  function sendToServer(eventData) {
    var payload = {
      event_name: eventData.event,
      data: eventData,
      sent_at: new Date().toISOString()
    };
    var payloadStr = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      var blob = new Blob([payloadStr], { type: 'application/json' });
      navigator.sendBeacon(config.endpoint, blob);
    } else {
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        keepalive: true
      }).catch(function(error) {
        console.error('Fetch failed:', error);
      });
    }
  }

  function track(eventName, properties) {
    properties = properties || {};
    var pageOverrides = properties._page || {};
    var userOverrides = properties._user || {};

    delete properties._page;
    delete properties._user;

    var eventData = {
      event: eventName,
      event_id: generateId(),
      timestamp: new Date().toISOString(),
      properties: properties,
      user: {
        user_id: userOverrides.user_id || state.userId,
        anonymous_id: state.anonymousId
      },
      session: { id: state.sessionId },
      page: getPageData(pageOverrides),
      client: getClientData()
    };

    sendToServer(eventData);
  }

  function identify(traits) {
    traits = traits || {};
    state.userId = traits.user_id || state.userId;

    var identifyData = {
      event: 'identify',
      event_id: generateId(),
      timestamp: new Date().toISOString(),
      properties: traits,
      user: {
        user_id: state.userId,
        anonymous_id: state.anonymousId
      },
      session: { id: state.sessionId },
      page: getPageData(),
      client: getClientData()
    };

    sendToServer(identifyData);
  }

  function init(options) {
    if (options) {
      for (var key in options) {
        if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
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

    var existingUser = getCookie('cdp_user_id');
    if (existingUser) {
      state.userId = existingUser;
    }
  }

  var cdpQueue = window.cdp && window.cdp.q || [];

  window.cdp = function() {
    var args = Array.prototype.slice.call(arguments);
    var command = args[0];
    var params = args.slice(1);

    switch (command) {
      case 'track':
        track(params[0], params[1]);
        break;
      case 'identify':
        identify(params[0]);
        break;
      case 'init':
        init(params[0]);
        break;
      default:
        console.error('Unknown command:', command);
    }
  };

  for (var i = 0; i < cdpQueue.length; i++) {
    window.cdp.apply(null, cdpQueue[i]);
  }

  window.cdp.version = '2.0.0';

})(window, document);
