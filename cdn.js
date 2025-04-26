(function(window, document) {
  "use strict";

  window.cdp = window.cdp || {};

  var config = {
    endpoint: window.cdp.endpoint,
    batch_events: false,
    batch_size: 10,
    batch_timeout: 1000
  };

  var state = {
    userId: null,
    anonymousId: generateId(),
    sessionId: generateId(),
    eventQueue: []
  };

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
    document.cookie = name + '=' + value + '; expires=' + date.toUTCString() + '; path=/';
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

  function identify(traits) {
    var identifyEvent = {
      event: 'identify',
      event_id: generateId(),
      timestamp: new Date().toISOString(),
      user: {
        user_id: state.userId,
        anonymous_id: state.anonymousId
      },
      traits: traits || {},
      session: { id: state.sessionId }
    };
    sendToServer(identifyEvent);
  }

  function track(eventName, properties) {
    var pageOverrides = properties && properties._page ? properties._page : null;
    var userOverrides = properties && properties._user ? properties._user : null;

    if (properties) {
      if (properties._page) delete properties._page;
      if (properties._user) delete properties._user;
    }

    var eventData = {
      event_id: generateId(),
      timestamp: new Date().toISOString(),
      properties: properties || {},
      user: {
        user_id: userOverrides && userOverrides.user_id !== undefined ? userOverrides.user_id : state.userId,
        anonymous_id: userOverrides && userOverrides.anonymous_id !== undefined ? userOverrides.anonymous_id : state.anonymousId
      },
      session: {
        id: state.sessionId
      },
      page: getPageData(pageOverrides),
      client: getClientData()
    };

    if (config.batch_events) {
      state.eventQueue.push({ event_name: eventName, data: [eventData], sent_at: new Date().toISOString() });
      if (state.eventQueue.length >= config.batch_size) {
        processBatch();
      } else if (state.eventQueue.length === 1) {
        setTimeout(processBatch, config.batch_timeout);
      }
    } else {
      sendToServer({ event_name: eventName, data: [eventData], sent_at: new Date().toISOString() });
    }
  }

  function processBatch() {
    if (state.eventQueue.length === 0) return;
    var batch = state.eventQueue.splice(0, config.batch_size);
    sendToServer(batch);
    if (state.eventQueue.length > 0) {
      setTimeout(processBatch, config.batch_timeout);
    }
  }

  function sendToServer(payload) {
    var payloadStr = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      try {
        var blob = new Blob([payloadStr], { type: 'application/json' });
        var sent = navigator.sendBeacon(config.endpoint, blob);
        if (sent) return;
      } catch (e) {}
    }

    try {
      fetch(config.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadStr,
        keepalive: true
      });
    } catch (e) {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', config.endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(payloadStr);
    }
  }

  var cdpQueue = window.cdp.q || [];
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
      case 'config':
        for (var key in params[0]) {
          if (params[0].hasOwnProperty(key)) config[key] = params[0][key];
        }
        break;
      case 'init':
        setup();
        break;
    }
  };

  function setup() {
    var existingAnonId = getCookie('cdp_anonymous_id');
    if (existingAnonId) {
      state.anonymousId = existingAnonId;
    } else {
      setCookie('cdp_anonymous_id', state.anonymousId, 365);
    }

    var existingUserId = getCookie('cdp_user_id');
    if (existingUserId) {
      state.userId = existingUserId;
    }
  }

  setup();

  for (var i = 0; i < cdpQueue.length; i++) {
    window.cdp.apply(window, cdpQueue[i]);
  }

})(window, document);
