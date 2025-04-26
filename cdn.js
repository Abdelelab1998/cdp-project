// Inside your CDP.js file

// Update the config object to include auto-tracking options
var config = {
    endpoint: 'https://api.your-cdp.com/collect',
    projectId: null,
    debug: false,
    cookie_domain: 'auto',
    cookie_expires: 365, // days
    cross_domain_linking: false,
    anonymize_ip: false,
    batch_events: true,
    batch_size: 10,
    batch_timeout: 1000, // ms
    retry_count: 3,
    // Auto-tracking configuration
    autoTrack: true,         // Master switch for all automatic tracking
    trackPageViews: true,    // Track page views automatically
    trackClicks: true,       // Track link clicks automatically
    trackForms: true         // Track form submissions automatically
};

function initialize(projectId, options) {
    if (state.initialized) {
        warn('CDP already initialized.');
        return;
    }
    
    // Set project ID
    config.projectId = projectId;
    
    // Apply custom options
    if (options) {
        for (var key in options) {
            if (options.hasOwnProperty(key) && config.hasOwnProperty(key)) {
                config[key] = options[key];
            }
        }
    }
    
    // Check for existing user ID
    var existingUserId = getCookie('cdp_user_id');
    if (existingUserId) {
        state.userId = existingUserId;
    } else {
        setCookie('cdp_anonymous_id', state.anonymousId, config.cookie_expires);
    }
    
    // Get page data
    state.pageData = getPageData();
    
    // Mark as initialized
    state.initialized = true;
    
    // Track page view automatically ONLY if auto-tracking is enabled
    if (config.autoTrack && config.trackPageViews) {
        trackEvent('page_view', {
            title: state.pageData.title,
            url: state.pageData.url,
            referrer: state.pageData.referrer
        });
    }
    
    log('CDP initialized with project ID:', projectId);
}

// Modify the attachEvents function to respect auto-tracking settings
function attachEvents() {
    if (!config.autoTrack) {
        return; // Skip all auto-tracking if master switch is off
    }
    
    // Track clicks on links (only if trackClicks is enabled)
    if (config.trackClicks) {
        document.addEventListener('click', function(e) {
            var target = e.target;
            
            // Check if clicked element or parent is a link
            while (target && target.tagName !== 'A') {
                target = target.parentNode;
                if (!target) return;
            }
            
            // Track outbound links
            if (target.hostname !== window.location.hostname) {
                trackEvent('outbound_link_click', {
                    url: target.href,
                    text: target.innerText || target.textContent,
                    id: target.id,
                    classes: target.className
                });
            }
        });
    }
    
    // Track form submissions (only if trackForms is enabled)
    if (config.trackForms) {
        document.addEventListener('submit', function(e) {
            var form = e.target;
            
            trackEvent('form_submit', {
                form_id: form.id,
                form_name: form.name,
                form_action: form.action,
                form_method: form.method
            });
        });
    }
}

// Attach events when DOM is ready, if auto-tracking is enabled
if (document.readyState === 'complete') {
    if (config.autoTrack) {
        attachEvents();
    }
} else {
    window.addEventListener('load', function() {
        if (config.autoTrack) {
            attachEvents();
        }
    });
}
