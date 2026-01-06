/**
 * WooCommerce Attribution Bridge - Survey Handler
 *
 * @package WooAttributionBridge
 */

(function () {
  "use strict";

  /**
   * Survey controller.
   */
  const WABSurvey = {
    /**
     * Survey container element.
     */
    container: null,

    /**
     * Order ID.
     */
    orderId: null,

    /**
     * Nonce for security.
     */
    nonce: null,

    /**
     * Is currently submitting.
     */
    isSubmitting: false,

    /**
     * Initialize the survey.
     */
    init: function () {
      this.container = document.getElementById("wab-survey");
      if (!this.container) {
        return;
      }

      this.orderId = this.container.dataset.orderId;
      this.nonce = this.container.dataset.nonce;

      this.bindEvents();
    },

    /**
     * Bind event handlers.
     */
    bindEvents: function () {
      // Option buttons.
      const options = this.container.querySelectorAll(".wab-survey-option");
      options.forEach(
        function (option) {
          option.addEventListener("click", this.handleOptionClick.bind(this));
        }.bind(this),
      );

      // Other submit button.
      const otherSubmit = this.container.querySelector(
        ".wab-survey-submit-other",
      );
      if (otherSubmit) {
        otherSubmit.addEventListener(
          "click",
          this.handleOtherSubmit.bind(this),
        );
      }

      // Other input enter key.
      const otherInput = this.container.querySelector(
        ".wab-survey-other-input",
      );
      if (otherInput) {
        otherInput.addEventListener(
          "keypress",
          function (e) {
            if (e.key === "Enter") {
              this.handleOtherSubmit();
            }
          }.bind(this),
        );
      }
    },

    /**
     * Handle option button click.
     *
     * @param {Event} e Click event.
     */
    handleOptionClick: function (e) {
      if (this.isSubmitting) {
        return;
      }

      const button = e.target;
      const value = button.dataset.value;
      const hasOther = button.dataset.hasOther === "true";

      // Mark as selected.
      this.container
        .querySelectorAll(".wab-survey-option")
        .forEach(function (opt) {
          opt.classList.remove("selected");
        });
      button.classList.add("selected");

      if (hasOther) {
        // Show other input.
        this.showOtherInput();
      } else {
        // Submit immediately.
        this.submit(value);
      }
    },

    /**
     * Show the "other" text input.
     */
    showOtherInput: function () {
      const otherDiv = this.container.querySelector(".wab-survey-other");
      if (otherDiv) {
        otherDiv.style.display = "flex";
        const input = otherDiv.querySelector("input");
        if (input) {
          input.focus();
        }
      }
    },

    /**
     * Handle other submit button click.
     */
    handleOtherSubmit: function () {
      if (this.isSubmitting) {
        return;
      }

      const input = this.container.querySelector(".wab-survey-other-input");
      const otherText = input ? input.value.trim() : "";

      this.submit("other", otherText);
    },

    /**
     * Submit survey response.
     *
     * @param {string} response Response value.
     * @param {string} other    Other text (optional).
     */
    submit: function (response, other) {
      if (this.isSubmitting) {
        return;
      }

      this.isSubmitting = true;
      this.setLoading(true, response);

      const data = new FormData();
      data.append("action", "wab_submit_survey");
      data.append("order_id", this.orderId);
      data.append("nonce", this.nonce);
      data.append("response", response);
      if (other) {
        data.append("other", other);
      }

      fetch(wabSurvey.ajaxUrl, {
        method: "POST",
        body: data,
        credentials: "same-origin",
      })
        .then(function (response) {
          return response.json();
        })
        .then(
          function (result) {
            this.isSubmitting = false;
            this.setLoading(false);

            if (result.success) {
              this.showThanks(result.data);
            } else {
              this.showError(
                result.data ? result.data.message : "Unknown error",
              );
            }
          }.bind(this),
        )
        .catch(
          function (error) {
            this.isSubmitting = false;
            this.setLoading(false);
            this.showError("Network error. Please try again.");
            console.error("WAB Survey error:", error);
          }.bind(this),
        );
    },

    /**
     * Set loading state.
     *
     * @param {boolean} loading  Is loading.
     * @param {string}  response Response being submitted.
     */
    setLoading: function (loading, response) {
      const options = this.container.querySelectorAll(".wab-survey-option");
      options.forEach(function (opt) {
        if (loading) {
          opt.classList.add("loading");
          if (response && opt.dataset.value === response) {
            opt.classList.add("selected");
          }
        } else {
          opt.classList.remove("loading");
        }
      });

      const submitBtn = this.container.querySelector(
        ".wab-survey-submit-other",
      );
      if (submitBtn) {
        submitBtn.disabled = loading;
      }
    },

    /**
     * Show thanks message.
     *
     * @param {Object} data Response data.
     */
    showThanks: function (data) {
      // Hide options.
      const optionsDiv = this.container.querySelector(".wab-survey-options");
      if (optionsDiv) {
        optionsDiv.style.display = "none";
      }

      const otherDiv = this.container.querySelector(".wab-survey-other");
      if (otherDiv) {
        otherDiv.style.display = "none";
      }

      // Show thanks.
      const thanksDiv = this.container.querySelector(".wab-survey-thanks");
      if (thanksDiv) {
        thanksDiv.style.display = "block";

        // Update coupon info if provided.
        if (data && data.show_coupon && data.coupon_code) {
          const couponEl = thanksDiv.querySelector(".wab-survey-coupon");
          if (couponEl) {
            couponEl.style.display = "block";
          }
        }
      }

      // Fire custom event.
      window.dispatchEvent(
        new CustomEvent("wab_survey_submitted", {
          detail: data,
        }),
      );
    },

    /**
     * Show error message.
     *
     * @param {string} message Error message.
     */
    showError: function (message) {
      const errorDiv = this.container.querySelector(".wab-survey-error");
      if (errorDiv) {
        const p = errorDiv.querySelector("p");
        if (p) {
          p.textContent = message;
        }
        errorDiv.style.display = "block";

        // Hide after 5 seconds.
        setTimeout(function () {
          errorDiv.style.display = "none";
        }, 5000);
      }
    },
  };

  // Initialize when DOM is ready.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      WABSurvey.init();
    });
  } else {
    WABSurvey.init();
  }

  // Expose for external use.
  window.WABSurvey = WABSurvey;
})();
