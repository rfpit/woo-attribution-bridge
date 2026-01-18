/**
 * WooCommerce Attribution Bridge - Browser Fingerprinting
 *
 * Generates a browser fingerprint from canvas, WebGL, audio, screen,
 * and timezone characteristics. Works without cookies for attribution.
 *
 * @package WooAttributionBridge
 */

(function () {
  "use strict";

  // Configuration from WordPress
  const config = window.wabFingerprintConfig || {
    enabled: true,
    ajaxUrl: "/wp-admin/admin-ajax.php",
    nonce: "",
    debug: false,
    components: {
      canvas: true,
      webgl: true,
      audio: true,
      screen: true,
      timezone: true,
      fonts: false,
    },
  };

  /**
   * Log debug messages.
   */
  function log(...args) {
    if (config.debug) {
      console.log("[WAB-FP]", ...args);
    }
  }

  /**
   * Generate SHA256 hash using Web Crypto API.
   */
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  /**
   * Get canvas fingerprint.
   */
  function getCanvasFingerprint() {
    if (!config.components.canvas) {
      return null;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 280;
      canvas.height = 60;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }

      // Draw diverse shapes and text for unique fingerprint
      ctx.fillStyle = "#f60";
      ctx.fillRect(125, 1, 62, 20);

      ctx.fillStyle = "#069";
      ctx.font = "14px Arial";
      ctx.fillText("WAB fingerprint", 2, 15);

      ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
      ctx.font = "18px Times New Roman";
      ctx.fillText("WAB fingerprint", 4, 45);

      // Add gradient
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, "red");
      gradient.addColorStop(0.5, "green");
      gradient.addColorStop(1, "blue");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 50, 280, 10);

      // Add arc
      ctx.beginPath();
      ctx.arc(50, 50, 20, 0, Math.PI * 2);
      ctx.stroke();

      const dataUrl = canvas.toDataURL();
      log("Canvas fingerprint generated");
      return dataUrl;
    } catch (e) {
      log("Canvas fingerprint failed:", e.message);
      return null;
    }
  }

  /**
   * Get WebGL fingerprint.
   */
  function getWebGLFingerprint() {
    if (!config.components.webgl) {
      return null;
    }

    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl") || canvas.getContext("experimental-webgl");

      if (!gl) {
        return null;
      }

      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const data = {
        vendor: gl.getParameter(gl.VENDOR),
        renderer: debugInfo
          ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxCubeMapSize: gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE),
        maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
        maxVertexAttribs: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxVertexUniformVectors: gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS),
        maxFragmentUniformVectors: gl.getParameter(
          gl.MAX_FRAGMENT_UNIFORM_VECTORS,
        ),
        maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
      };

      log("WebGL fingerprint generated:", data.renderer);
      return JSON.stringify(data);
    } catch (e) {
      log("WebGL fingerprint failed:", e.message);
      return null;
    }
  }

  /**
   * Get audio fingerprint using AudioContext.
   */
  function getAudioFingerprint() {
    if (!config.components.audio) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
          resolve(null);
          return;
        }

        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const analyser = context.createAnalyser();
        const gainNode = context.createGain();
        const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

        // Configure oscillator
        oscillator.type = "triangle";
        oscillator.frequency.setValueAtTime(10000, context.currentTime);

        // Configure gain (mute output)
        gainNode.gain.setValueAtTime(0, context.currentTime);

        // Connect nodes
        oscillator.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(gainNode);
        gainNode.connect(context.destination);

        let fingerprint = null;

        scriptProcessor.onaudioprocess = function (event) {
          const inputData = event.inputBuffer.getChannelData(0);
          // Sum a subset of the audio data for fingerprint
          let sum = 0;
          for (let i = 0; i < inputData.length; i += 100) {
            sum += Math.abs(inputData[i]);
          }
          fingerprint = sum.toString();

          // Cleanup
          oscillator.disconnect();
          analyser.disconnect();
          scriptProcessor.disconnect();
          gainNode.disconnect();
          context.close();

          log("Audio fingerprint generated");
          resolve(fingerprint);
        };

        oscillator.start(0);

        // Timeout fallback
        setTimeout(() => {
          if (!fingerprint) {
            try {
              oscillator.stop();
              context.close();
            } catch (e) {
              // Ignore cleanup errors
            }
            resolve(null);
          }
        }, 500);
      } catch (e) {
        log("Audio fingerprint failed:", e.message);
        resolve(null);
      }
    });
  }

  /**
   * Get screen fingerprint.
   */
  function getScreenFingerprint() {
    if (!config.components.screen) {
      return null;
    }

    try {
      const data = {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
        devicePixelRatio: window.devicePixelRatio || 1,
        orientation: screen.orientation ? screen.orientation.type : "unknown",
      };

      log("Screen fingerprint generated:", data.width + "x" + data.height);
      return JSON.stringify(data);
    } catch (e) {
      log("Screen fingerprint failed:", e.message);
      return null;
    }
  }

  /**
   * Get timezone fingerprint.
   */
  function getTimezoneFingerprint() {
    if (!config.components.timezone) {
      return null;
    }

    try {
      const data = {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        locale: navigator.language || navigator.userLanguage,
        languages: navigator.languages ? navigator.languages.join(",") : "",
      };

      log("Timezone fingerprint generated:", data.timezone);
      return JSON.stringify(data);
    } catch (e) {
      log("Timezone fingerprint failed:", e.message);
      return null;
    }
  }

  /**
   * Get basic browser/platform info.
   */
  function getPlatformFingerprint() {
    try {
      const data = {
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        cookieEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack || "unspecified",
      };

      log("Platform fingerprint generated");
      return JSON.stringify(data);
    } catch (e) {
      log("Platform fingerprint failed:", e.message);
      return null;
    }
  }

  /**
   * Get fonts fingerprint (optional, disabled by default).
   */
  function getFontsFingerprint() {
    if (!config.components.fonts) {
      return null;
    }

    try {
      const testFonts = [
        "Arial",
        "Arial Black",
        "Arial Narrow",
        "Calibri",
        "Cambria",
        "Century Gothic",
        "Comic Sans MS",
        "Consolas",
        "Courier",
        "Courier New",
        "Georgia",
        "Helvetica",
        "Impact",
        "Lucida Console",
        "Lucida Sans Unicode",
        "Monaco",
        "Palatino Linotype",
        "Tahoma",
        "Times",
        "Times New Roman",
        "Trebuchet MS",
        "Verdana",
      ];

      const baseFonts = ["monospace", "sans-serif", "serif"];
      const testString = "mmmmmmmmmmlli";
      const testSize = "72px";

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }

      const detectedFonts = [];

      // Get baseline widths
      const baseWidths = {};
      baseFonts.forEach((baseFont) => {
        ctx.font = testSize + " " + baseFont;
        baseWidths[baseFont] = ctx.measureText(testString).width;
      });

      // Test each font
      testFonts.forEach((font) => {
        let detected = false;
        baseFonts.forEach((baseFont) => {
          ctx.font = testSize + ' "' + font + '",' + baseFont;
          const width = ctx.measureText(testString).width;
          if (width !== baseWidths[baseFont]) {
            detected = true;
          }
        });
        if (detected) {
          detectedFonts.push(font);
        }
      });

      log("Fonts fingerprint generated:", detectedFonts.length + " fonts");
      return detectedFonts.join(",");
    } catch (e) {
      log("Fonts fingerprint failed:", e.message);
      return null;
    }
  }

  /**
   * Collect all fingerprint components.
   */
  async function collectComponents() {
    const components = {
      canvas: getCanvasFingerprint(),
      webgl: getWebGLFingerprint(),
      audio: await getAudioFingerprint(),
      screen: getScreenFingerprint(),
      timezone: getTimezoneFingerprint(),
      platform: getPlatformFingerprint(),
      fonts: getFontsFingerprint(),
    };

    // Filter out null components
    const filtered = {};
    for (const [key, value] of Object.entries(components)) {
      if (value !== null) {
        filtered[key] = value;
      }
    }

    log("Components collected:", Object.keys(filtered));
    return filtered;
  }

  /**
   * Generate the final fingerprint hash.
   */
  async function generateFingerprint() {
    const components = await collectComponents();

    // Create a stable string from components
    const keys = Object.keys(components).sort();
    const values = keys.map((k) => components[k]);
    const combined = values.join("|||");

    // Generate hash
    const hash = await sha256(combined);

    log("Fingerprint hash generated:", hash.substring(0, 16) + "...");

    return {
      hash: hash,
      components: Object.keys(components),
    };
  }

  /**
   * Get current attribution data from cookie or global.
   */
  function getCurrentAttribution() {
    // Try to get from WAB cookie
    const cookieName = window.wabConfig?.cookieName || "wab_attribution";
    const cookieValue = document.cookie
      .split(";")
      .find((c) => c.trim().startsWith(cookieName + "="));

    if (cookieValue) {
      try {
        return JSON.parse(decodeURIComponent(cookieValue.split("=")[1]));
      } catch (e) {
        return {};
      }
    }

    return {};
  }

  /**
   * Send fingerprint to server.
   */
  async function sendToServer(fingerprintData) {
    const attribution = getCurrentAttribution();

    const payload = {
      action: "wab_store_fingerprint",
      nonce: config.nonce,
      fingerprint_hash: fingerprintData.hash,
      components: fingerprintData.components.join(","),
      visitor_id: attribution.visitor_id || null,
      click_ids: {},
      utm_params: attribution.utm || {},
      landing_page:
        attribution.landing_page || window.location.href.split("?")[0],
      referrer: attribution.referrer || document.referrer || null,
    };

    // Extract click IDs
    const clickIdParams = [
      "fbclid",
      "gclid",
      "ttclid",
      "msclkid",
      "dclid",
      "li_fat_id",
    ];
    clickIdParams.forEach((param) => {
      if (attribution[param]) {
        payload.click_ids[param] = attribution[param];
      }
    });

    // Also check URL for fresh click IDs
    const urlParams = new URLSearchParams(window.location.search);
    clickIdParams.forEach((param) => {
      if (urlParams.has(param)) {
        payload.click_ids[param] = urlParams.get(param);
      }
    });

    payload.click_ids = JSON.stringify(payload.click_ids);
    payload.utm_params = JSON.stringify(payload.utm_params);

    try {
      const response = await fetch(config.ajaxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(payload).toString(),
        credentials: "same-origin",
      });

      const result = await response.json();

      if (result.success) {
        log("Fingerprint stored successfully");

        // If server returned attribution data (cookie-less fallback)
        if (result.data && result.data.attribution) {
          log(
            "Retrieved attribution from fingerprint:",
            result.data.attribution,
          );
        }
      } else {
        log("Fingerprint storage failed:", result.data);
      }

      return result;
    } catch (e) {
      log("Fingerprint send failed:", e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Main fingerprint function.
   */
  async function fingerprint() {
    if (!config.enabled) {
      log("Fingerprinting disabled");
      return;
    }

    // Check if crypto API is available
    if (!crypto || !crypto.subtle) {
      log("Web Crypto API not available");
      return;
    }

    try {
      const fingerprintData = await generateFingerprint();
      await sendToServer(fingerprintData);
    } catch (e) {
      log("Fingerprinting failed:", e.message);
    }
  }

  /**
   * Initialize on DOM ready.
   */
  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fingerprint);
    } else {
      // Small delay to let wab-capture.js run first
      setTimeout(fingerprint, 100);
    }
  }

  // Run
  init();

  // Expose for debugging
  window.WAB = window.WAB || {};
  window.WAB.fingerprint = {
    generate: generateFingerprint,
    send: async function () {
      const data = await generateFingerprint();
      return sendToServer(data);
    },
    debug: async function () {
      const data = await generateFingerprint();
      console.log("Fingerprint hash:", data.hash);
      console.log("Components:", data.components);
      const components = await collectComponents();
      console.table(components);
    },
  };
})();
