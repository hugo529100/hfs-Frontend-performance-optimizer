(() => {
  const STORAGE_KEY_OPTIMIZE = 'hfs_optimize_scope';
  const OPTIMIZE_SCOPE_ID = 'optimize-scope-select';
  const SETTINGS_PANEL_ID = 'performance-settings-panel';
  
  // 監控狀態標記
  let videoPlayerVisible = false;
  let imageViewerVisible = false;
  let mediaCheckInterval = null;
  let mediaObserver = null;
  let visibilityObserver = null;
  const CHECK_INTERVAL = 500;

  // 優化範圍選項
  const OPTIMIZE_SCOPES = {
    0: { name: 'Disabled' },
    1: { name: 'Video Only' },
    2: { name: 'Video and Image' },
    3: { name: 'Full Page' }
  };

  // 檢查 localStorage 是否支持
  const isLocalStorageSupported = () => {
    try {
      localStorage.setItem('test', '1');
      localStorage.removeItem('test');
      return true;
    } catch (e) {
      return false;
    }
  };

  // 獲取儲存的優化範圍
  const getOptimizeScope = () => {
    if (!isLocalStorageSupported()) return 2; // 默認為視頻和圖片
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY_OPTIMIZE);
      if (stored !== null) {
        const value = parseInt(stored);
        // 確保值在有效範圍內 (0-3)
        if (value >= 0 && value <= 3) return value;
      }
      return 2; // 默認值
    } catch (e) {
      return 2;
    }
  };

  // 儲存優化範圍
  const setOptimizeScope = (value) => {
    if (isLocalStorageSupported()) {
      localStorage.setItem(STORAGE_KEY_OPTIMIZE, value.toString());
    }
  };

  // 切換性能優化模式
  const toggleOptimization = (enable) => {
    if (!document.body) return;
    
    if (enable) {
      document.body.classList.add('accelerated-mode');
    } else {
      document.body.classList.remove('accelerated-mode');
    }
  };

  // 檢查是否需要啟用優化
  const checkAndApplyOptimization = () => {
    const scope = getOptimizeScope();
    
    // 根據範圍決定優化邏輯
    switch (scope) {
      case 0: // 不啟用
        toggleOptimization(false);
        break;
        
      case 1: // 僅視頻 - 嚴格檢查只有視頻
        toggleOptimization(videoPlayerVisible && !imageViewerVisible);
        break;
        
      case 2: // 視頻和圖片
        toggleOptimization(videoPlayerVisible || imageViewerVisible);
        break;
        
      case 3: // 整個頁面
        toggleOptimization(true);
        break;
        
      default:
        toggleOptimization(false);
    }
  };

  // 檢查是否為視頻播放器 - 嚴格檢測
  const isVideoPlayer = (el) => {
    if (!el) return false;
    
    // 1. 直接是 video 元素
    if (el.nodeName === 'VIDEO') {
      return true;
    }
    
    // 2. 檢查是否為視頻播放器容器
    if (el.classList) {
      // 視頻播放器常見的類名
      if (el.classList.contains('video-player') || 
          el.classList.contains('player') ||
          el.classList.contains('media-player') ||
          el.classList.contains('video-container')) {
        // 確保容器內有 video 元素
        if (el.querySelector('video')) {
          return true;
        }
      }
    }
    
    // 3. 檢查是否為視頻播放器對話框
    if (el.getAttribute('role') === 'dialog' && el.classList.contains('contain')) {
      // 確保對話框內有 video 元素
      if (el.querySelector('video')) {
        return true;
      }
    }
    
    return false;
  };

  // 檢查是否為圖片瀏覽器 - 嚴格檢測，排除視頻相關元素
  const isImageViewer = (el) => {
    if (!el || !el.classList) return false;
    
    // 如果是 video 相關元素，直接排除
    if (el.nodeName === 'VIDEO' || el.querySelector('video')) {
      return false;
    }
    
    // 檢查是否為包含圖片瀏覽器的對話框
    if (el.getAttribute('role') === 'dialog' && el.classList.contains('contain')) {
      // 確保不是視頻對話框
      if (el.querySelector('video')) {
        return false;
      }
      
      const hasShowingContainer = el.querySelector('.showing-container');
      const hasShowingImage = el.querySelector('img.showing');
      const hasPreviewControls = el.querySelector('.preview-controls-fullscreen-btn');
      
      if ((hasShowingContainer && hasShowingImage) || hasPreviewControls) {
        return true;
      }
    }
    
    // 檢查是否為圖片瀏覽器的主要容器
    if (el.classList.contains('showing-container') && el.querySelector('img.showing')) {
      // 確保容器內沒有 video
      if (!el.querySelector('video')) {
        return true;
      }
    }
    
    // 檢查是否為全屏圖片的對話框
    if (el.classList.contains('showing') && el.nodeName === 'IMG') {
      const dialog = el.closest('[role="dialog"].contain');
      if (dialog && !dialog.querySelector('video')) {
        return true;
      }
    }
    
    return false;
  };

  // 獲取所有需要監控的媒體元素
  const getMediaElements = () => {
    const elements = {
      videos: [],
      images: []
    };
    
    // 1. 獲取所有視頻相關元素 - 嚴格識別
    // 所有 video 標籤
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      elements.videos.push(video);
      
      // 加入 video 的播放器容器
      const playerContainer = video.closest('.video-player, .player, .media-player, [role="dialog"].contain');
      if (playerContainer && !elements.videos.includes(playerContainer)) {
        elements.videos.push(playerContainer);
      }
    });
    
    // 視頻播放器容器
    const playerContainers = document.querySelectorAll('.video-player, .player, .media-player, .video-container');
    playerContainers.forEach(container => {
      if (container.querySelector('video') && !elements.videos.includes(container)) {
        elements.videos.push(container);
      }
    });
    
    // 視頻播放器對話框
    const videoDialogs = document.querySelectorAll('[role="dialog"].contain');
    videoDialogs.forEach(dialog => {
      if (dialog.querySelector('video') && !elements.videos.includes(dialog)) {
        elements.videos.push(dialog);
      }
    });
    
    // 2. 獲取所有圖片瀏覽器相關元素 - 嚴格識別，排除視頻
    // 圖片瀏覽器對話框
    const imageDialogs = document.querySelectorAll('[role="dialog"].contain');
    imageDialogs.forEach(dialog => {
      // 確保不是視頻對話框
      if (!dialog.querySelector('video') && 
          ((dialog.querySelector('.showing-container') && dialog.querySelector('img.showing')) ||
          dialog.querySelector('.preview-controls-fullscreen-btn'))) {
        if (!elements.images.includes(dialog)) {
          elements.images.push(dialog);
        }
      }
    });
    
    // showing containers
    const showingContainers = document.querySelectorAll('.showing-container');
    showingContainers.forEach(container => {
      // 確保不是視頻容器
      if (!container.querySelector('video') && 
          container.querySelector('img.showing') && 
          !elements.images.includes(container)) {
        elements.images.push(container);
      }
    });
    
    // showing images
    const showingImages = document.querySelectorAll('img.showing');
    showingImages.forEach(img => {
      const dialog = img.closest('[role="dialog"].contain');
      if (dialog) {
        // 如果圖片在對話框中，確保對話框不是視頻對話框
        if (!dialog.querySelector('video') && !elements.images.includes(dialog)) {
          elements.images.push(dialog);
        }
      } else if (!elements.images.includes(img)) {
        elements.images.push(img);
      }
    });
    
    return elements;
  };

  // 檢查元素是否在視口中可見
  const isElementInViewport = (el) => {
    if (!el) return false;
    
    const rect = el.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;
    const windowWidth = window.innerWidth || document.documentElement.clientWidth;
    
    const vertInView = (rect.top <= windowHeight) && ((rect.top + rect.height) >= 0);
    const horInView = (rect.left <= windowWidth) && ((rect.left + rect.width) >= 0);
    
    return vertInView && horInView;
  };

  // 檢查元素是否實際可見
  const isElementActuallyVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  };

  // 更新媒體可見性狀態
  const updateMediaVisibility = () => {
    const elements = getMediaElements();
    let newVideoVisible = false;
    let newImageVisible = false;
    
    // 檢查視頻可見性
    for (const video of elements.videos) {
      if (isElementInViewport(video) && isElementActuallyVisible(video)) {
        newVideoVisible = true;
        break;
      }
    }
    
    // 檢查圖片可見性
    for (const image of elements.images) {
      if (isElementInViewport(image) && isElementActuallyVisible(image)) {
        newImageVisible = true;
        break;
      }
    }
    
    // 更新狀態
    const videoChanged = (newVideoVisible !== videoPlayerVisible);
    const imageChanged = (newImageVisible !== imageViewerVisible);
    
    videoPlayerVisible = newVideoVisible;
    imageViewerVisible = newImageVisible;
    
    // 如果有變化，重新檢查是否需要優化
    if (videoChanged || imageChanged) {
      checkAndApplyOptimization();
    }
  };

  // 使用 Intersection Observer 監控媒體可見性
  const setupVisibilityObserver = () => {
    if (visibilityObserver) {
      visibilityObserver.disconnect();
    }
    
    visibilityObserver = new IntersectionObserver((entries) => {
      let needsUpdate = false;
      
      for (const entry of entries) {
        const el = entry.target;
        if (!isElementActuallyVisible(el)) continue;
        
        // 檢查是否為視頻相關元素
        if (isVideoPlayer(el)) {
          const wasVisible = videoPlayerVisible;
          videoPlayerVisible = entry.isIntersecting;
          if (wasVisible !== videoPlayerVisible) needsUpdate = true;
        } 
        // 檢查是否為圖片相關元素
        else if (isImageViewer(el)) {
          const wasVisible = imageViewerVisible;
          imageViewerVisible = entry.isIntersecting;
          if (wasVisible !== imageViewerVisible) needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        checkAndApplyOptimization();
      }
    }, {
      threshold: 0.1
    });
    
    // 監控所有現有的媒體元素
    const elements = getMediaElements();
    elements.videos.forEach(video => visibilityObserver.observe(video));
    elements.images.forEach(image => visibilityObserver.observe(image));
    
    // 監聽新添加的媒體元素
    if (mediaObserver) {
      mediaObserver.disconnect();
    }
    
    mediaObserver = new MutationObserver((mutations) => {
      let needsRecheck = false;
      
      for (const mutation of mutations) {
        if (mutation.addedNodes.length) {
          for (const node of mutation.addedNodes) {
            if (!node.nodeType || node.nodeType !== 1) continue;
            
            // 檢查新增的視頻相關元素
            if (isVideoPlayer(node)) {
              visibilityObserver.observe(node);
              needsRecheck = true;
            }
            
            // 檢查新增的圖片瀏覽器
            if (isImageViewer(node)) {
              visibilityObserver.observe(node);
              needsRecheck = true;
            }
            
            // 檢查子元素
            if (node.querySelectorAll) {
              const videos = node.querySelectorAll('video');
              videos.forEach(video => {
                if (isVideoPlayer(video)) {
                  visibilityObserver.observe(video);
                  needsRecheck = true;
                }
              });
              
              const images = node.querySelectorAll('img.showing');
              images.forEach(img => {
                if (isImageViewer(img)) {
                  visibilityObserver.observe(img);
                  needsRecheck = true;
                }
              });
            }
          }
        }
      }
      
      if (needsRecheck) {
        setTimeout(updateMediaVisibility, 100);
      }
    });
    
    mediaObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  // 開始監控媒體
  const startMediaMonitoring = () => {
    if (!window.IntersectionObserver) {
      if (mediaCheckInterval) {
        clearInterval(mediaCheckInterval);
      }
      
      mediaCheckInterval = setInterval(updateMediaVisibility, CHECK_INTERVAL);
    } else {
      setupVisibilityObserver();
    }
  };

  // 在Options界面中添加設置面板
  const insertSettingsPanel = () => {
    const optionsDialog = document.querySelector('.dialog[aria-modal="true"]');
    if (!optionsDialog) return;

    const themeSelect = document.getElementById('option-theme');
    if (!themeSelect) return;

    if (document.getElementById(SETTINGS_PANEL_ID)) {
      return;
    }

    const currentScope = getOptimizeScope();

    const settingsHTML = `
      <div id="${SETTINGS_PANEL_ID}" style="margin-top:1em; padding-top:1em; border-top:1px solid var(--fg-2);">
        <div style="margin-bottom: 0.5em;">
          <label style="display: block; margin-bottom: 0.2em; font-size: 0.9em;">Performance Optimization Scope:</label>
          <select id="${OPTIMIZE_SCOPE_ID}" style="width: 100%; padding: 0.4em;">
            <option value="0" ${currentScope === 0 ? 'selected' : ''}>${OPTIMIZE_SCOPES[0].name}</option>
            <option value="1" ${currentScope === 1 ? 'selected' : ''}>${OPTIMIZE_SCOPES[1].name}</option>
            <option value="2" ${currentScope === 2 ? 'selected' : ''}>${OPTIMIZE_SCOPES[2].name}</option>
            <option value="3" ${currentScope === 3 ? 'selected' : ''}>${OPTIMIZE_SCOPES[3].name}</option>
          </select>
        </div>
      </div>
    `;

    themeSelect.insertAdjacentHTML('afterend', settingsHTML);

    const scopeSelect = document.getElementById(OPTIMIZE_SCOPE_ID);

    scopeSelect.addEventListener('change', (e) => {
      const newScope = parseInt(e.target.value);
      setOptimizeScope(newScope);
      
      // 重新檢查優化狀態
      checkAndApplyOptimization();
    });
  };

  // 初始化
  const init = () => {
    // 初始化優化狀態
    checkAndApplyOptimization();
    
    // 開始媒體監控
    startMediaMonitoring();

    // 監聽Options對話框的出現
    const observer = new MutationObserver((mutations) => {
      if (document.querySelector('.dialog-title')?.textContent.includes('Options')) {
        setTimeout(insertSettingsPanel, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();