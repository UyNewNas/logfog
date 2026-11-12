'use strict';

const rewriteSelection = 'logfog-rewrite-selection';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: rewriteSelection,
      title: '用 LogFog 改写选中文字',
      contexts: ['selection'],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== rewriteSelection || !info.selectionText?.trim()) return;

  await chrome.storage.session.set({
    logfogSource: info.selectionText,
    logfogVariant: 0,
  });

  if (chrome.action.openPopup) {
    try {
      const options = tab?.windowId >= 0 ? {windowId: tab.windowId} : {};
      await chrome.action.openPopup(options);
      return;
    } catch {
      // Some Chromium versions expose openPopup only to policy-installed extensions.
    }
  }
  await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 432,
    height: 620,
    focused: true,
  });
});
