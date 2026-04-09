function getTouchDistance(touchA, touchB) {
  return Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
}

function getTouchMidpoint(touchA, touchB) {
  return {
    x: (touchA.clientX + touchB.clientX) / 2,
    y: (touchA.clientY + touchB.clientY) / 2,
  };
}

export function createBoardViewportController({
  DOM,
  editor,
  state,
  minZoom,
  maxZoom,
  zoomStep,
  navigateProblems,
}) {
  let pinchState = null;
  let panState = null;

  function updateBoardZoomUi() {
    const percentage = Math.round(state.boardZoom * 100);
    DOM.zoomResetBtn.textContent = `${percentage}%`;
    DOM.zoomOutBtn.disabled = state.boardZoom <= minZoom;
    DOM.zoomInBtn.disabled = state.boardZoom >= maxZoom;
  }

  function syncBoardViewport() {
    if (!DOM.boardViewport || !DOM.currentBoard || !DOM.boardMedia) return;
    if (!DOM.currentBoard.naturalWidth || !DOM.currentBoard.naturalHeight) {
      updateBoardZoomUi();
      return;
    }

    const viewport = DOM.boardViewport;
    const viewportWidth = Math.max(0, viewport.clientWidth);
    const viewportHeight = Math.max(0, viewport.clientHeight);
    if (!viewportWidth || !viewportHeight) {
      updateBoardZoomUi();
      return;
    }

    const widthRatio = viewportWidth / DOM.currentBoard.naturalWidth;
    const heightRatio = viewportHeight / DOM.currentBoard.naturalHeight;
    const fitRatio = Math.min(widthRatio, heightRatio);
    const baseWidth = DOM.currentBoard.naturalWidth * fitRatio;
    const baseHeight = DOM.currentBoard.naturalHeight * fitRatio;
    const scaledWidth = baseWidth * state.boardZoom;
    const scaledHeight = baseHeight * state.boardZoom;

    viewport.style.justifyContent = scaledWidth > viewportWidth ? 'flex-start' : 'center';
    viewport.style.alignItems = 'flex-start';

    DOM.boardMedia.style.width = `${scaledWidth}px`;
    DOM.boardMedia.style.height = `${scaledHeight}px`;
    DOM.currentBoard.style.width = `${scaledWidth}px`;
    DOM.currentBoard.style.height = `${scaledHeight}px`;
    updateBoardZoomUi();
    editor.syncCanvasToImage();
  }

  function setBoardZoom(nextZoom, { anchorClientX = null, anchorClientY = null } = {}) {
    if (!DOM.boardViewport || !DOM.boardMedia) return;

    const previousZoom = state.boardZoom;
    const clamped = Math.max(minZoom, Math.min(maxZoom, Number(nextZoom.toFixed(2))));
    if (clamped === previousZoom) {
      updateBoardZoomUi();
      return;
    }

    const viewport = DOM.boardViewport;
    const rect = viewport.getBoundingClientRect();
    const anchorX = anchorClientX ?? (rect.left + rect.width / 2);
    const anchorY = anchorClientY ?? (rect.top + rect.height / 2);
    const relativeX = anchorX - rect.left;
    const relativeY = anchorY - rect.top;
    const contentX = (viewport.scrollLeft + relativeX) / previousZoom;
    const contentY = (viewport.scrollTop + relativeY) / previousZoom;

    state.boardZoom = clamped;
    syncBoardViewport();

    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, contentX * clamped - relativeX);
      viewport.scrollTop = Math.max(0, contentY * clamped - relativeY);
    });
  }

  function resetBoardZoom() {
    state.boardZoom = minZoom;
    syncBoardViewport();

    if (DOM.boardViewport) {
      DOM.boardViewport.scrollLeft = 0;
      DOM.boardViewport.scrollTop = 0;
    }

    updateBoardZoomUi();
  }

  function bindSwipeNavigation(element) {
    if (!element) return;

    let startX = 0;
    let startY = 0;

    element.addEventListener('touchstart', (event) => {
      const touch = event.changedTouches[0];
      startX = touch.clientX;
      startY = touch.clientY;
    }, { passive: true });

    element.addEventListener('touchend', (event) => {
      if (state.isPlacementMode || state.boardZoom > minZoom) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
        return;
      }

      navigateProblems(deltaX < 0 ? 1 : -1);
    }, { passive: true });
  }

  function bindBoardTouchZoom() {
    if (!DOM.boardViewport) return;

    DOM.boardViewport.addEventListener('touchstart', (event) => {
      if (!state.currentBoard) return;
      if (event.touches.length === 2) {
        event.preventDefault();
        const [touchA, touchB] = event.touches;
        pinchState = {
          startDistance: getTouchDistance(touchA, touchB),
          startZoom: state.boardZoom,
        };
        panState = null;
        return;
      }

      if (event.touches.length === 1 && state.boardZoom > minZoom) {
        event.preventDefault();
        const touch = event.touches[0];
        panState = {
          startX: touch.clientX,
          startY: touch.clientY,
          startScrollLeft: DOM.boardViewport.scrollLeft,
          startScrollTop: DOM.boardViewport.scrollTop,
        };
      }
    }, { passive: false });

    DOM.boardViewport.addEventListener('touchmove', (event) => {
      if (!state.currentBoard) return;
      if (event.touches.length === 2 && pinchState) {
        event.preventDefault();
        const [touchA, touchB] = event.touches;
        const distance = getTouchDistance(touchA, touchB);
        const midpoint = getTouchMidpoint(touchA, touchB);
        const nextZoom = pinchState.startZoom * (distance / pinchState.startDistance);

        setBoardZoom(nextZoom, {
          anchorClientX: midpoint.x,
          anchorClientY: midpoint.y,
        });
        return;
      }

      if (event.touches.length === 1 && state.boardZoom > minZoom) {
        if (!panState) {
          const touch = event.touches[0];
          panState = {
            startX: touch.clientX,
            startY: touch.clientY,
            startScrollLeft: DOM.boardViewport.scrollLeft,
            startScrollTop: DOM.boardViewport.scrollTop,
          };
        }

        event.preventDefault();
        const touch = event.touches[0];
        const deltaX = touch.clientX - panState.startX;
        const deltaY = touch.clientY - panState.startY;
        DOM.boardViewport.scrollLeft = panState.startScrollLeft - deltaX;
        DOM.boardViewport.scrollTop = panState.startScrollTop - deltaY;
      }
    }, { passive: false });

    DOM.boardViewport.addEventListener('touchend', (event) => {
      if (pinchState && state.boardZoom <= 1.04) {
        resetBoardZoom();
      }

      if (event.touches.length === 1 && state.boardZoom > minZoom) {
        const touch = event.touches[0];
        panState = {
          startX: touch.clientX,
          startY: touch.clientY,
          startScrollLeft: DOM.boardViewport.scrollLeft,
          startScrollTop: DOM.boardViewport.scrollTop,
        };
      } else {
        panState = null;
      }

      if (event.touches.length < 2) {
        pinchState = null;
      }
    }, { passive: true });

    DOM.boardViewport.addEventListener('touchcancel', () => {
      pinchState = null;
      panState = null;
    }, { passive: true });
  }

  function bindEvents() {
    DOM.zoomOutBtn.addEventListener('click', () => setBoardZoom(state.boardZoom - zoomStep));
    DOM.zoomResetBtn.addEventListener('click', resetBoardZoom);
    DOM.zoomInBtn.addEventListener('click', () => setBoardZoom(state.boardZoom + zoomStep));
    bindSwipeNavigation(DOM.boardMedia);
    bindSwipeNavigation(DOM.problemInfoCard);
    bindBoardTouchZoom();
    window.addEventListener('resize', syncBoardViewport);
  }

  function observeResize() {
    if (!('ResizeObserver' in window)) return null;

    const observer = new ResizeObserver(() => {
      syncBoardViewport();
    });
    observer.observe(DOM.boardFrame);
    observer.observe(DOM.boardViewport);
    return observer;
  }

  return {
    bindEvents,
    observeResize,
    resetBoardZoom,
    setBoardZoom,
    syncBoardViewport,
    updateBoardZoomUi,
  };
}
