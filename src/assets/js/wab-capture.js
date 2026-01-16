/**
 * WooCommerce Attribution Bridge - Click ID Capture
 *
 * Captures click IDs (fbclid, gclid, ttclid, etc.) and UTM parameters
 * from the URL and stores them in a first-party cookie.
 *
 * @package WooAttributionBridge
 */

(function () {
  "use strict";

  // Configuration from WordPress
  const config = window.wabConfig || {
    cookieName: "wab_attribution",
    cookieExpiry: 90,
    debug: false,
    captureParams: {
      fbclid: true,
      gclid: true,
      ttclid: true,
      msclkid: true,
      utm: true,
    },
  };

  /**
   * Check if user has granted advertising/marketing cookie consent.
   * Supports CookieYes, Cookiebot, Complianz, and GDPR Cookie Consent plugins.
   *
   * @returns {boolean} True if consent granted, false otherwise.
   */
  function hasAdvertisingConsent() {
    // Check CookieYes consent
    const cookieYesMatch = document.cookie.match(/cookieyes-consent=([^;]+)/);
    if (cookieYesMatch) {
      const consentValue = decodeURIComponent(cookieYesMatch[1]);
      const hasConsent = consentValue.includes("advertisement:yes");
      log("CookieYes consent check:", hasConsent ? "granted" : "denied");
      return hasConsent;
    }

    // Check Cookiebot consent
    const cookiebotMatch = document.cookie.match(/CookieConsent=([^;]+)/);
    if (cookiebotMatch) {
      try {
        const consentValue = decodeURIComponent(cookiebotMatch[1]);
        const hasConsent = consentValue.includes("marketing:true");
        log("Cookiebot consent check:", hasConsent ? "granted" : "denied");
        return hasConsent;
      } catch (e) {
        // Parse error, assume no consent
      }
    }

    // Check Complianz consent
    const complianzMatch = document.cookie.match(/cmplz_marketing=([^;]+)/);
    if (complianzMatch) {
      const hasConsent = complianzMatch[1] === "allow";
      log("Complianz consent check:", hasConsent ? "granted" : "denied");
      return hasConsent;
    }

    // Check GDPR Cookie Consent
    const gdprMatch = document.cookie.match(/gdpr_consent_given=([^;]+)/);
    if (gdprMatch) {
      const hasConsent = gdprMatch[1] === "1";
      log("GDPR Cookie Consent check:", hasConsent ? "granted" : "denied");
      return hasConsent;
    }

    // No consent management detected - default to allowing cookies
    // (server-side will handle consent check as fallback)
    log("No consent management detected, allowing cookies");
    return true;
  }

  // Click ID parameters to capture
  const CLICK_ID_PARAMS = [
    "fbclid",
    "gclid",
    "ttclid",
    "msclkid",
    "dclid",
    "li_fat_id",
  ];

  // UTM parameters to capture
  const UTM_PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
  ];

  /**
   * Log debug messages.
   */
  function log(...args) {
    if (config.debug) {
      console.log("[WAB]", ...args);
    }
  }

  /**
   * Get URL parameters.
   */
  function getUrlParams() {
    const params = {};
    const searchParams = new URLSearchParams(window.location.search);

    for (const [key, value] of searchParams) {
      params[key] = value;
    }

    return params;
  }

  /**
   * Get a cookie by name.
   */
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
      try {
        return JSON.parse(decodeURIComponent(parts.pop().split(";").shift()));
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /**
   * Set a cookie.
   */
  function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);

    const expires = `expires=${date.toUTCString()}`;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const sameSite = "; SameSite=Lax";

    document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))}; ${expires}; path=/${secure}${sameSite}`;
  }

  /**
   * Generate a visitor ID.
   */
  function generateVisitorId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }

  /**
   * Extract click IDs from URL.
   */
  function extractClickIds(params) {
    const clickIds = {};

    for (const param of CLICK_ID_PARAMS) {
      if (params[param] && config.captureParams[param] !== false) {
        clickIds[param] = params[param];
        log(`Captured ${param}:`, params[param].substring(0, 20) + "...");
      }
    }

    return clickIds;
  }

  /**
   * Extract UTM parameters from URL.
   */
  function extractUtmParams(params) {
    if (!config.captureParams.utm) {
      return {};
    }

    const utm = {};

    for (const param of UTM_PARAMS) {
      if (params[param]) {
        utm[param] = params[param];
      }
    }

    return utm;
  }

  /**
   * Get Facebook browser ID (_fbp).
   */
  function getFacebookBrowserId() {
    const fbpCookie = document.cookie
      .split(";")
      .find((c) => c.trim().startsWith("_fbp="));
    return fbpCookie ? fbpCookie.split("=")[1] : null;
  }

  /**
   * Get TikTok tracking parameter (_ttp).
   */
  function getTikTokTtp() {
    const ttpCookie = document.cookie
      .split(";")
      .find((c) => c.trim().startsWith("_ttp="));
    return ttpCookie ? ttpCookie.split("=")[1] : null;
  }

  /**
   * Main capture function.
   */
  function capture() {
    const params = getUrlParams();
    const clickIds = extractClickIds(params);
    const utmParams = extractUtmParams(params);

    // Get existing attribution data
    let attribution = getCookie(config.cookieName) || {};

    // Ensure visitor ID exists
    if (!attribution.visitor_id) {
      attribution.visitor_id = generateVisitorId();
      log("Generated visitor ID:", attribution.visitor_id);
    }

    // Check if we have new click IDs
    const hasNewClickIds = Object.keys(clickIds).length > 0;
    const hasUtmParams = Object.keys(utmParams).length > 0;

    if (hasNewClickIds) {
      const timestamp = Math.floor(Date.now() / 1000);

      // Set first touch if not already set
      if (!attribution.first_touch) {
        attribution.first_touch = {
          ...clickIds,
          timestamp: timestamp,
        };
        log("Set first touch:", attribution.first_touch);
      }

      // Always update last touch with new click IDs
      attribution.last_touch = {
        ...clickIds,
        timestamp: timestamp,
      };
      log("Set last touch:", attribution.last_touch);

      // Store individual click IDs at root level
      Object.assign(attribution, clickIds);
    }

    // Store UTM parameters
    if (hasUtmParams) {
      attribution.utm = utmParams;
      log("Captured UTM:", utmParams);
    }

    // Capture landing page on first visit
    if (!attribution.landing_page) {
      attribution.landing_page = window.location.href.split("?")[0];
      log("Captured landing page:", attribution.landing_page);
    }

    // Capture referrer (external only)
    if (!attribution.referrer && document.referrer) {
      try {
        const refHost = new URL(document.referrer).hostname;
        const siteHost = window.location.hostname;

        if (refHost !== siteHost) {
          attribution.referrer = document.referrer;
          log("Captured referrer:", attribution.referrer);
        }
      } catch (e) {
        // Invalid referrer URL
      }
    }

    // Capture Facebook browser ID
    const fbp = getFacebookBrowserId();
    if (fbp && !attribution.fbp) {
      attribution.fbp = fbp;
      log("Captured _fbp:", fbp);
    }

    // Capture TikTok tracking parameter
    const ttp = getTikTokTtp();
    if (ttp && !attribution._ttp) {
      attribution._ttp = ttp;
      log("Captured _ttp:", ttp);
    }

    // Record timestamp
    attribution.last_seen = Math.floor(Date.now() / 1000);

    // Only save to cookie if consent is granted
    if (hasAdvertisingConsent()) {
      setCookie(config.cookieName, attribution, config.cookieExpiry);
      log("Attribution data saved to cookie:", attribution);
    } else {
      // Clear any existing cookie when consent is revoked
      document.cookie = `${config.cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      log(
        "Consent not granted, cookie cleared (server-side cache will be used)",
      );
    }
  }

  /**
   * Initialize on DOM ready.
   */
  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", capture);
    } else {
      capture();
    }
  }

  // Run
  init();

  // Expose for debugging
  window.WAB = {
    getAttribution: function () {
      return getCookie(config.cookieName);
    },
    clearAttribution: function () {
      document.cookie = `${config.cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      log("Attribution cleared");
    },
    debug: function () {
      console.table(getCookie(config.cookieName));
    },
  };
})();
