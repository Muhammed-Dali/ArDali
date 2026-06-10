const pluginId = ArDaliPluginAPI.id;
const stateKey = "__ardaliYoutubeFocusInstalled";
const badgeId = `${pluginId}-badge`;
const buttonId = `${pluginId}-button`;
const toastId = `${pluginId}-toast`;

const applyBoxStyle = (element, styles) => {
  Object.entries(styles).forEach(([key, value]) => {
    element.style[key] = value;
  });
};

const hideDistractions = () => {
  const focusEnabled = document.documentElement.dataset.ardaliYoutubeFocus === "1";
  const selectors = [
    "ytd-watch-next-secondary-results-renderer",
    "#secondary",
    "#secondary-inner",
    "#related",
    "ytd-rich-section-renderer",
    'ytd-item-section-renderer[section-identifier="related-items"]',
  ];
  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((node) => {
      node.style.display = focusEnabled ? "none" : "";
    });
  });
  document.querySelectorAll("ytd-watch-flexy #columns").forEach((node) => {
    node.style.justifyContent = focusEnabled ? "center" : "";
  });
  document.querySelectorAll("ytd-watch-flexy[flexy] #primary").forEach((node) => {
    node.style.width = focusEnabled ? "calc(100% - 56px)" : "";
    node.style.maxWidth = focusEnabled ? "1280px" : "";
    node.style.marginInline = focusEnabled ? "auto" : "";
  });
};

const showToast = () => {
  if (!document.body || document.getElementById(toastId)) return;
  const toast = document.createElement("div");
  toast.id = toastId;
  toast.textContent = "ArDali Odak modu aktif";
  applyBoxStyle(toast, {
    position: "fixed",
    zIndex: "2147483647",
    right: "18px",
    bottom: "102px",
    padding: "10px 13px",
    border: "1px solid rgba(51, 240, 176, 0.55)",
    borderRadius: "10px",
    background: "rgba(4, 16, 18, 0.96)",
    color: "#e9fcff",
    font: "800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    boxShadow: "0 14px 32px rgba(0, 0, 0, 0.38)",
    transition: "opacity 220ms ease, transform 220ms ease",
    pointerEvents: "none",
  });
  document.body.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(6px)";
  }, 1800);
  window.setTimeout(() => {
    toast.remove();
  }, 2100);
};

const ensureBadge = () => {
  if (document.getElementById(badgeId) || !document.body) return;
  const badge = document.createElement("div");
  badge.id = badgeId;
  const light = document.createElement("i");
  const text = document.createElement("span");
  text.textContent = "ArDali resmi eklenti aktif";
  badge.append(light, text);
  applyBoxStyle(badge, {
    position: "fixed",
    zIndex: "2147483647",
    right: "18px",
    bottom: "18px",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    height: "34px",
    padding: "0 12px",
    border: "1px solid rgba(0, 200, 255, 0.45)",
    borderRadius: "10px",
    background: "rgba(4, 12, 15, 0.92)",
    color: "#dffaff",
    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.35)",
    font: "700 12px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    pointerEvents: "none",
  });
  applyBoxStyle(light, {
    width: "9px",
    height: "9px",
    borderRadius: "999px",
    background: "#33f0b0",
    boxShadow: "0 0 16px rgba(51, 240, 176, 0.75)",
  });
  document.body.appendChild(badge);
};

const ensureButton = () => {
  if (document.getElementById(buttonId) || !document.body) return;
  const button = document.createElement("button");
  button.id = buttonId;
  button.type = "button";
  const updateLabel = () => {
    button.textContent = document.documentElement.dataset.ardaliYoutubeFocus === "1" ? "Odak modu: Acik" : "Odak modu: Kapali";
  };
  button.addEventListener("click", () => {
    const enabled = document.documentElement.dataset.ardaliYoutubeFocus !== "1";
    document.documentElement.dataset.ardaliYoutubeFocus = enabled ? "1" : "0";
    try { localStorage.setItem(stateKey, enabled ? "1" : "0"); } catch (_) {}
    updateLabel();
    hideDistractions();
    if (enabled) showToast();
  });
  applyBoxStyle(button, {
    position: "fixed",
    zIndex: "2147483647",
    right: "18px",
    bottom: "60px",
    height: "36px",
    padding: "0 13px",
    border: "1px solid rgba(0, 200, 255, 0.48)",
    borderRadius: "10px",
    background: "rgba(0, 31, 38, 0.96)",
    color: "#e9fcff",
    cursor: "pointer",
    font: "800 12px/1 system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.34)",
  });
  button.addEventListener("mouseenter", () => {
    button.style.background = "rgba(0, 103, 125, 0.96)";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "rgba(0, 31, 38, 0.96)";
  });
  updateLabel();
  document.body.appendChild(button);
};

let initialFocusEnabled = true;
try {
  const savedState = localStorage.getItem(stateKey);
  if (savedState === "0" || savedState === "1") {
    initialFocusEnabled = savedState === "1";
  } else {
    localStorage.setItem(stateKey, "1");
  }
} catch (_) {}
document.documentElement.dataset.ardaliYoutubeFocus = initialFocusEnabled ? "1" : "0";

ensureBadge();
ensureButton();
hideDistractions();
if (initialFocusEnabled) showToast();

if (!window.__ardaliYoutubeFocusObserver) {
  window.__ardaliYoutubeFocusObserver = new MutationObserver(() => {
    ensureBadge();
    ensureButton();
    hideDistractions();
  });
  window.__ardaliYoutubeFocusObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}
