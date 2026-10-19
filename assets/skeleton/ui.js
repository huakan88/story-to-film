// ui.js — the whole 2D layer, as ONE pure function of time.
// UI.frame(t) writes opacity/transform/text directly; nothing is kept between frames,
// so a still seeked to any t is exactly what the render shows.
//
// Edit the TIMING block below to match your film; the rest is machinery.
(function () {
  const K = window.WORLD_KIT || {};
  const clamp = K.clamp || ((v, a = 0, b = 1) => (v < a ? a : v > b ? b : v));
  const seg = K.seg || ((t, a, b) => clamp((t - a) / (b - a)));
  const lerp = K.lerp || ((a, b, k) => a + (b - a) * k);
  const easeOut = K.easeOut || ((x) => 1 - Math.pow(1 - x, 3));

  // ---------------- TIMING: the only numbers you normally touch ----------------
  const TIMING = {
    duration: 8,        // seconds — keep index.html's data-duration in sync
    veilOut: 0.9,       // fade in from black over [0, veilOut]
    hudIn: 0.4,         // label fades in
    hudOut: 2.2,        // …and out again
    captionIn: 5.3,     // caption starts
    captionInEnd: 6.1,  // fully visible
    captionOut: 7.4,    // starts to leave
    captionOutEnd: 8.0, // gone
  };

  const el = {};
  const $ = (s) => document.querySelector(s);

  function mount(overrides) {
    Object.assign(TIMING, overrides || {});
    el.veil = $('#veil');
    el.cap = $('#cap');
    el.l1 = $('#cap .l1');
    el.l2 = $('#cap .l2');
    el.hud = $('#hud');
    el.text = $('#hud .t');
  }

  function frame(t) {
    if (!el.veil) return;

    // fade in from black
    el.veil.style.opacity = String(1 - easeOut(seg(t, 0, TIMING.veilOut)));

    // label: in, hold, out
    const hudIn = seg(t, TIMING.hudIn, TIMING.hudIn + 0.5);
    const hudOut = seg(t, TIMING.hudOut, TIMING.hudOut + 0.6);
    el.hud.style.opacity = String(Math.max(0, hudIn - hudOut) * 0.62);
    el.hud.style.transform = 'translateX(' + lerp(-16, 0, easeOut(hudIn)) + 'px)';

    // caption: in, hold, out — a scrim rides along (it lives in CSS, so opacity is enough)
    const inK = easeOut(seg(t, TIMING.captionIn, TIMING.captionInEnd));
    const outK = seg(t, TIMING.captionOut, TIMING.captionOutEnd);
    el.cap.style.opacity = String(Math.max(0, inK - outK));
    el.l1.style.transform = 'translateY(' + (lerp(22, 0, inK) + lerp(0, -18, outK)) + 'px)';
    el.l2.style.opacity = String(Math.max(0, seg(t, TIMING.captionIn + 0.35, TIMING.captionInEnd + 0.3) - outK) * 0.72);
  }

  window.UI = { mount, frame, TIMING };
})();
