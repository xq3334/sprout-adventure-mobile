(() => {
  'use strict';

  const page = document.documentElement;
  const notice = document.querySelector('.rotate-notice');
  const manualButton = document.getElementById('manual-landscape');
  let manualLandscape = false;
  let previousLayout = '';
  let resizeTimer;

  function updateViewport() {
    // Layout dimensions remain usable in webviews that omit orientation events.
    const width = page.clientWidth || window.innerWidth;
    const height = window.innerHeight || page.clientHeight;
    const portrait = height > width;
    const rotated = portrait && manualLandscape;
    const gameWidth = rotated ? height : width;
    const gameHeight = rotated ? width : height;
    const blocked = portrait && !manualLandscape;
    page.style.setProperty('--game-width', `${gameWidth}px`);
    page.style.setProperty('--game-height', `${gameHeight}px`);
    page.style.setProperty('--viewport-width', `${width}px`);
    document.body.dataset.rotated = String(rotated);
    document.body.dataset.compact = String(gameHeight <= 500);
    document.body.dataset.short = String(gameHeight <= 370);
    document.body.dataset.orientationBlocked = String(blocked);
    notice.hidden = !blocked;
    const layout = `${portrait}:${rotated}:${blocked}`;
    if (layout !== previousLayout) {
      previousLayout = layout;
      window.dispatchEvent(new Event('gameviewportchange'));
    }
  }

  function scheduleViewportUpdate() {
    updateViewport();
    clearTimeout(resizeTimer);
    // Some mobile browsers update layout after the orientation event has fired.
    resizeTimer = setTimeout(updateViewport, 300);
  }

  manualButton.addEventListener('click', () => {
    manualLandscape = true;
    updateViewport();
    document.getElementById('play-button').focus({ preventScroll: true });
  });
  window.addEventListener('resize', scheduleViewportUpdate);
  window.addEventListener('orientationchange', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
  window.screen.orientation?.addEventListener('change', scheduleViewportUpdate);
  window.addEventListener('pageshow', scheduleViewportUpdate);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) scheduleViewportUpdate();
  });
  updateViewport();
})();
