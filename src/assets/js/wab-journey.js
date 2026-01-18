/**
 * WooCommerce Attribution Bridge - Customer Journey Tracker
 *
 * Tracks page views and cart events to build complete customer journeys.
 * This enables showing entry points and referrers even for "direct" orders.
 *
 * @package WooAttributionBridge
 */

(function () {
  "use strict";

  // Configuration from WordPress
  const config = window.wabJourneyConfig || {
    enabled: true,
    restUrl: "/wp-json/wab/v1/journey",
    nonce: "",
    sessionTimeout: 30, // minutes
    debug: false,
  };

  // Session cookie name
  const SESSION_COOKIE = "wab_session";

  /**
   * Log debug messages.
   */
  function log(...args) {
    if (config.debug) {
      console.log("[WAB Journey]", ...args);
    }
  }

  /**
   * Check if user has granted cookie consent.
   * Supports CookieYes, Cookiebot, Complianz, and GDPR Cookie Consent plugins.
   *
   * @returns {boolean} True if consent granted, false otherwise.
   */
  function hasConsent() {
    // Check CookieYes consent - analytics or functional is sufficient for journey tracking
    const cookieYesMatch = document.cookie.match(/cookieyes-consent=([^;]+)/);
    if (cookieYesMatch) {
      const consentValue = decodeURIComponent(cookieYesMatch[1]);
      const hasConsent =
        consentValue.includes("analytics:yes") ||
        consentValue.includes("functional:yes");
      return hasConsent;
    }

    // Check Cookiebot consent
    const cookiebotMatch = document.cookie.match(/CookieConsent=([^;]+)/);
    if (cookiebotMatch) {
      try {
        const consentValue = decodeURIComponent(cookiebotMatch[1]);
        const hasConsent =
          consentValue.includes("statistics:true") ||
          consentValue.includes("preferences:true");
        return hasConsent;
      } catch (e) {
        // Parse error, assume no consent
      }
    }

    // Check Complianz consent
    const complianzStats = document.cookie.match(/cmplz_statistics=([^;]+)/);
    const complianzFunc = document.cookie.match(/cmplz_functional=([^;]+)/);
    if (complianzStats || complianzFunc) {
      return (
        (complianzStats && complianzStats[1] === "allow") ||
        (complianzFunc && complianzFunc[1] === "allow")
      );
    }

    // Check GDPR Cookie Consent
    const gdprMatch = document.cookie.match(/gdpr_consent_given=([^;]+)/);
    if (gdprMatch) {
      return gdprMatch[1] === "1";
    }

    // No consent management detected - default to allowing (server will validate)
    return true;
  }

  /**
   * Generate a unique session ID.
   */
  function generateSessionId() {
    return (
      "sess_" +
      Date.now().toString(36) +
      Math.random().toString(36).substr(2, 9)
    );
  }

  /**
   * Get a cookie by name.
   */
  function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);

    if (parts.length === 2) {
      return parts.pop().split(";").shift();
    }

    return null;
  }

  /**
   * Set a cookie with rolling expiry.
   */
  function setCookie(name, value, minutes) {
    const date = new Date();
    date.setTime(date.getTime() + minutes * 60 * 1000);

    const expires = `expires=${date.toUTCString()}`;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    const sameSite = "; SameSite=Lax";

    document.cookie = `${name}=${value}; ${expires}; path=/${secure}${sameSite}`;
  }

  /**
   * Get or create session ID with rolling expiry.
   */
  function getOrCreateSessionId() {
    let sessionId = getCookie(SESSION_COOKIE);

    if (!sessionId) {
      sessionId = generateSessionId();
      log("Created new session:", sessionId);
    } else {
      log("Continuing session:", sessionId);
    }

    // Always update the cookie to extend expiry (rolling session)
    setCookie(SESSION_COOKIE, sessionId, config.sessionTimeout);

    return sessionId;
  }

  /**
   * Get visitor ID from attribution cookie.
   */
  function getVisitorId() {
    const wabCookie = getCookie("wab_a");
    if (wabCookie) {
      try {
        const data = JSON.parse(decodeURIComponent(wabCookie));
        return data.visitor_id || null;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Detect page type from body classes and URL patterns.
   */
  function detectPageType() {
    const body = document.body;
    const url = window.location.pathname;

    // WooCommerce-specific classes
    if (body.classList.contains("woocommerce-checkout")) {
      return "checkout";
    }
    if (body.classList.contains("woocommerce-cart")) {
      return "cart";
    }
    if (body.classList.contains("single-product")) {
      return "product";
    }
    if (body.classList.contains("tax-product_cat")) {
      return "category";
    }
    if (body.classList.contains("post-type-archive-product")) {
      return "shop";
    }

    // WordPress general classes
    if (body.classList.contains("home") || url === "/") {
      return "home";
    }
    if (body.classList.contains("single-post")) {
      return "post";
    }
    if (body.classList.contains("page")) {
      return "page";
    }

    // URL pattern fallbacks
    if (url.includes("/product/")) {
      return "product";
    }
    if (url.includes("/product-category/")) {
      return "category";
    }
    if (url.includes("/cart")) {
      return "cart";
    }
    if (url.includes("/checkout")) {
      return "checkout";
    }

    return "other";
  }

  /**
   * Get product ID from page if on a product page.
   */
  function getProductId() {
    const pageType = detectPageType();

    if (pageType !== "product") {
      return null;
    }

    // Try to get from body class (WooCommerce adds postid-XXX)
    const body = document.body;
    const classes = body.className.split(" ");
    for (const cls of classes) {
      if (cls.startsWith("postid-")) {
        return parseInt(cls.replace("postid-", ""), 10);
      }
    }

    // Try to get from data attribute
    const productForm = document.querySelector("form.cart");
    if (productForm) {
      const productId = productForm.querySelector('[name="add-to-cart"]');
      if (productId) {
        return parseInt(productId.value, 10);
      }
    }

    return null;
  }

  /**
   * Track a page view.
   */
  async function trackPageView() {
    if (!config.enabled) {
      log("Journey tracking disabled");
      return;
    }

    if (!hasConsent()) {
      log("No consent for journey tracking");
      return;
    }

    const sessionId = getOrCreateSessionId();
    const visitorId = getVisitorId();
    const pageType = detectPageType();
    const productId = getProductId();

    const payload = {
      action: "page_view",
      session_id: sessionId,
      visitor_id: visitorId,
      page_url: window.location.pathname + window.location.search,
      page_type: pageType,
      page_title: document.title,
      product_id: productId,
      referrer: document.referrer || null,
      entry_referrer:
        sessionStorage.getItem("wab_entry_referrer") ||
        document.referrer ||
        null,
    };

    // Store entry referrer for the session
    if (!sessionStorage.getItem("wab_entry_referrer") && document.referrer) {
      sessionStorage.setItem("wab_entry_referrer", document.referrer);
    }

    log("Tracking page view:", payload);

    try {
      const response = await fetch(config.restUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": config.nonce,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        log("Failed to track page view:", response.status);
      } else {
        const data = await response.json();
        log("Page view tracked:", data);
      }
    } catch (error) {
      log("Error tracking page view:", error);
    }
  }

  /**
   * Track a cart event (add to cart, remove from cart, etc.).
   */
  async function trackCartEvent(eventType, productId, quantity = 1) {
    if (!config.enabled) {
      return;
    }

    if (!hasConsent()) {
      return;
    }

    const sessionId = getOrCreateSessionId();
    const visitorId = getVisitorId();

    const payload = {
      action: "cart_event",
      session_id: sessionId,
      visitor_id: visitorId,
      event_type: eventType,
      product_id: productId,
      quantity: quantity,
    };

    log("Tracking cart event:", payload);

    try {
      const response = await fetch(config.restUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-WP-Nonce": config.nonce,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        log("Failed to track cart event:", response.status);
      } else {
        const data = await response.json();
        log("Cart event tracked:", data);
      }
    } catch (error) {
      log("Error tracking cart event:", error);
    }
  }

  /**
   * Set up WooCommerce event listeners.
   */
  function setupWooCommerceListeners() {
    // Listen for jQuery AJAX add-to-cart events
    if (typeof jQuery !== "undefined") {
      jQuery(document.body).on(
        "added_to_cart",
        function (event, fragments, cart_hash, button) {
          const productId = button ? button.data("product_id") : null;
          const quantity = button
            ? parseInt(button.data("quantity") || 1, 10)
            : 1;

          if (productId) {
            trackCartEvent("add_to_cart", productId, quantity);
          }
        },
      );

      jQuery(document.body).on(
        "removed_from_cart",
        function (event, fragments, cart_hash, button) {
          const productId = button ? button.data("product_id") : null;

          if (productId) {
            trackCartEvent("remove_from_cart", productId);
          }
        },
      );

      // Listen for single product add to cart form submission
      jQuery("form.cart").on("submit", function () {
        const form = jQuery(this);
        const productId = form.find('[name="add-to-cart"]').val();
        const quantity = parseInt(
          form.find('[name="quantity"]').val() || 1,
          10,
        );

        if (productId) {
          trackCartEvent("add_to_cart", parseInt(productId, 10), quantity);
        }
      });
    }

    // Detect checkout start
    const pageType = detectPageType();
    if (pageType === "checkout") {
      const sessionId = getOrCreateSessionId();
      const visitorId = getVisitorId();

      // Track checkout_start as a cart event
      trackCartEvent("checkout_start", 0); // 0 for no specific product
    }
  }

  /**
   * Handle consent change events.
   */
  function onConsentChange() {
    if (hasConsent()) {
      log("Consent granted, tracking page view");
      trackPageView();
    } else {
      log("Consent revoked, stopping tracking");
    }
  }

  /**
   * Set up listeners for consent management platforms.
   */
  function setupConsentListeners() {
    // CookieYes
    document.addEventListener("cookieyes_consent_update", function () {
      onConsentChange();
    });

    // Cookiebot
    if (typeof window.Cookiebot !== "undefined") {
      window.addEventListener("CookiebotOnAccept", onConsentChange);
      window.addEventListener("CookiebotOnDecline", onConsentChange);
    }

    // Complianz
    document.addEventListener("cmplz_status_change", onConsentChange);

    // GDPR Cookie Consent
    document.addEventListener("gdpr_consent_changed", onConsentChange);
  }

  /**
   * Initialize journey tracking.
   */
  function init() {
    if (!config.enabled) {
      log("Journey tracking is disabled");
      return;
    }

    log("Initializing journey tracking");

    // Set up consent listeners
    setupConsentListeners();

    // Track page view on DOM ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        trackPageView();
        setupWooCommerceListeners();
      });
    } else {
      trackPageView();
      setupWooCommerceListeners();
    }
  }

  // Run
  init();

  // Expose for debugging
  window.WABJourney = {
    getSessionId: function () {
      return getCookie(SESSION_COOKIE);
    },
    trackPageView: trackPageView,
    trackCartEvent: trackCartEvent,
    debug: function () {
      console.log("Session ID:", getCookie(SESSION_COOKIE));
      console.log("Visitor ID:", getVisitorId());
      console.log("Page Type:", detectPageType());
      console.log("Product ID:", getProductId());
      console.log("Has Consent:", hasConsent());
    },
  };
})();
