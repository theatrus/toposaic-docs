// Minimal dependency-free lightbox for screenshots.
// Every content image (figures, galleries, hero shot) becomes clickable and
// opens near-fullscreen; Esc / click closes. The caption is carried over and
// a link to the raw asset gives true 1:1 full resolution.
(function () {
  'use strict';

  var overlay;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML =
      '<figure><img alt=""><figcaption>' +
      '<span class="lb-caption"></span>' +
      '<a class="lb-full" target="_blank" rel="noopener">Open full resolution ↗</a>' +
      '</figcaption></figure>' +
      '<button class="lb-close" aria-label="Close">×</button>';
    overlay.addEventListener('click', function (e) {
      // Clicking anywhere except the full-res link closes.
      if (!e.target.closest('.lb-full')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
    document.body.appendChild(overlay);
    return overlay;
  }

  function open(src, caption) {
    var o = ensureOverlay();
    o.querySelector('img').src = src;
    o.querySelector('.lb-caption').textContent = caption || '';
    o.querySelector('.lb-full').href = src;
    o.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove('show');
    document.body.style.overflow = '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var imgs = document.querySelectorAll(
      'figure img, .gallery img, .shot-pair img, .docs-main img'
    );
    imgs.forEach(function (img) {
      // Skip UI chrome (logo etc.) — only zoom real content images.
      if (img.closest('.brand') || img.classList.contains('hero-logo')) return;
      img.classList.add('lb-zoomable');
      img.addEventListener('click', function () {
        var fig = img.closest('figure');
        var cap = fig && fig.querySelector('figcaption');
        open(img.currentSrc || img.src, cap ? cap.textContent.trim() : img.alt);
      });
    });
  });
})();
