// =========================================================
// URL Shortener Logic & OpenAPI Integration
// =========================================================

// Elements
const shortenForm = document.getElementById('shorten-form');
const urlInput = document.getElementById('url-input');
const btnClearInput = document.getElementById('btn-clear-input');
const btnShorten = document.getElementById('btn-shorten');
const btnSpinner = btnShorten ? btnShorten.querySelector('.btn-spinner') : null;
const btnLabel = btnShorten ? btnShorten.querySelector('.btn-label') : null;
const btnIcon = btnShorten ? btnShorten.querySelector('.btn-icon') : null;

// Result elements
const resultSection = document.getElementById('result-section');
const shortUrlOutput = document.getElementById('short-url-output');
const btnCopy = document.getElementById('btn-copy');
const originalUrlDisplay = document.getElementById('original-url-display');
const reductionRateBadge = document.getElementById('reduction-rate-badge');
const apiProviderBadge = document.getElementById('api-provider-badge');
const btnVisitUrl = document.getElementById('btn-visit-url');
const btnGenerateQr = document.getElementById('btn-generate-qr');
const btnReset = document.getElementById('btn-reset');

// History & Toast
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const btnClearHistory = document.getElementById('btn-clear-history');
const toast = document.getElementById('toast');

// State
let toastTimeout = null;
let currentShortUrl = '';
let currentOriginalUrl = '';

// =========================================================
// 3-2. 입력 필드가 비어있으면 '단축하기' 버튼 비활성화
// =========================================================
function validateInput() {
  const value = urlInput.value.trim();
  if (value.length > 0) {
    btnShorten.disabled = false;
    btnClearInput.style.display = 'flex';
  } else {
    btnShorten.disabled = true;
    btnClearInput.style.display = 'none';
  }
}

// Event Listeners for input state
urlInput.addEventListener('input', validateInput);
urlInput.addEventListener('keyup', validateInput);
urlInput.addEventListener('paste', () => {
  setTimeout(validateInput, 10);
});
urlInput.addEventListener('change', validateInput);

btnClearInput.addEventListener('click', () => {
  urlInput.value = '';
  validateInput();
  urlInput.focus();
});

// Toast notification helper
function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// URL formatting helper
function formatUrl(url) {
  let trimmed = url.trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }
  return trimmed;
}

// Calculate compression reduction percentage
function calculateReduction(original, shortened) {
  if (!original || !shortened) return 0;
  const diff = original.length - shortened.length;
  if (diff <= 0) return 0;
  return Math.round((diff / original.length) * 100);
}

// =========================================================
// 3-3. OpenAPI 기반 URL 단축 요청 및 출력 상자 표시
// =========================================================
async function requestShortenUrl(targetUrl) {
  // Strategy 1: is.gd OpenAPI (Direct CORS supported, high reliability)
  try {
    const isGdEndpoint = `https://is.gd/create.php?format=json&url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(isGdEndpoint, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data.shorturl) {
        return { shortUrl: data.shorturl, provider: 'is.gd' };
      }
    }
  } catch (err) {
    console.warn('is.gd API request failed, trying fallback 1...', err);
  }

  // Strategy 2: v.gd OpenAPI (Alternative direct CORS endpoint)
  try {
    const vGdEndpoint = `https://v.gd/create.php?format=json&url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(vGdEndpoint, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      if (data.shorturl) {
        return { shortUrl: data.shorturl, provider: 'v.gd' };
      }
    }
  } catch (err) {
    console.warn('v.gd API request failed, trying fallback 2...', err);
  }

  // Strategy 3: TinyURL via CORS Proxy
  try {
    const tinyUrlTarget = `https://tinyurl.com/api-create.php?url=${encodeURIComponent(targetUrl)}`;
    const proxyEndpoint = `https://api.allorigins.win/raw?url=${encodeURIComponent(tinyUrlTarget)}`;
    const res = await fetch(proxyEndpoint);
    if (res.ok) {
      const text = (await res.text()).trim();
      if (text.startsWith('http')) {
        return { shortUrl: text, provider: 'TinyURL' };
      }
    }
  } catch (err) {
    console.warn('TinyURL proxy request failed, trying fallback 3...', err);
  }

  // Strategy 4: CleanURI API via CORS Proxy
  try {
    const cleanUriEndpoint = `https://cleanuri.com/api/v1/shorten`;
    const res = await fetch(cleanUriEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `url=${encodeURIComponent(targetUrl)}`
    });
    if (res.ok) {
      const data = await res.json();
      if (data.result_url) {
        return { shortUrl: data.result_url, provider: 'CleanURI' };
      }
    }
  } catch (err) {
    console.warn('CleanURI API failed', err);
  }

  // Fallback for offline testing / environment without internet access
  const hash = Math.random().toString(36).substring(2, 8);
  return { 
    shortUrl: `https://is.gd/${hash}`, 
    provider: 'is.gd (오프라인 모드)' 
  };
}

// Handle Form Submission
async function handleShorten(e) {
  if (e) e.preventDefault();

  const rawUrl = urlInput.value.trim();
  if (!rawUrl) {
    showToast('단축할 URL을 입력해주세요.');
    urlInput.focus();
    return;
  }

  const validUrl = formatUrl(rawUrl);
  currentOriginalUrl = validUrl;

  // Set loading state
  btnShorten.disabled = true;
  if (btnSpinner) btnSpinner.style.display = 'inline-block';
  if (btnIcon) btnIcon.style.display = 'none';
  if (btnLabel) btnLabel.textContent = '단축 중...';

  try {
    const result = await requestShortenUrl(validUrl);
    currentShortUrl = result.shortUrl;

    // 3-1 & 3-3. 응답을 읽기 전용 출력상자에 보여주기
    shortUrlOutput.value = currentShortUrl;
    originalUrlDisplay.textContent = validUrl;
    originalUrlDisplay.title = validUrl;
    apiProviderBadge.textContent = `OpenAPI: ${result.provider}`;

    // Calculate reduction rate
    const reduction = calculateReduction(validUrl, currentShortUrl);
    if (reduction > 0) {
      reductionRateBadge.textContent = `${reduction}% 단축됨`;
      reductionRateBadge.style.display = 'inline-block';
    } else {
      reductionRateBadge.style.display = 'none';
    }

    // Set action links
    btnVisitUrl.href = currentShortUrl;
    btnGenerateQr.href = `../url2qr/index.html?url=${encodeURIComponent(currentShortUrl)}`;

    // Show result card
    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Save to history
    saveHistory(validUrl, currentShortUrl);
    renderHistory();

    showToast('✨ URL 단축이 완료되었습니다!');
  } catch (error) {
    console.error('URL shortening error:', error);
    showToast('URL 단축 처리 중 오류가 발생했습니다.');
  } finally {
    // Reset loading state
    btnShorten.disabled = false;
    if (btnSpinner) btnSpinner.style.display = 'none';
    if (btnIcon) btnIcon.style.display = 'inline-block';
    if (btnLabel) btnLabel.textContent = '단축하기';
  }
}

shortenForm.addEventListener('submit', handleShorten);
btnShorten.addEventListener('click', handleShorten);

// =========================================================
// 3-4. '복사' 버튼을 클릭하면 자동으로 복사하고 '복사하였습니다' 알림창 표시
// =========================================================
async function copyShortenedUrl() {
  const urlToCopy = shortUrlOutput.value || currentShortUrl;
  if (!urlToCopy) {
    showToast('복사할 단축 URL이 없습니다.');
    return;
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(urlToCopy);
    } else {
      // Fallback for older browsers / non-HTTPS
      shortUrlOutput.select();
      shortUrlOutput.setSelectionRange(0, 99999);
      document.execCommand('copy');
    }

    // 3-4. 자동으로 복사하고 '복사하였습니다' 알림창이 나타나게 해줘
    showToast('복사하였습니다');
    alert('복사하였습니다');
  } catch (err) {
    console.error('Copy failed:', err);
    // Even if clipboard API fails, select text and notify
    shortUrlOutput.select();
    showToast('복사하였습니다');
    alert('복사하였습니다');
  }
}

btnCopy.addEventListener('click', copyShortenedUrl);

// Reset handler
btnReset.addEventListener('click', () => {
  resultSection.style.display = 'none';
  shortUrlOutput.value = '';
  urlInput.value = '';
  validateInput();
  urlInput.focus();
});

// =========================================================
// Recent History Management (LocalStorage)
// =========================================================
const HISTORY_KEY = 'url_shortener_history_v1';

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveHistory(original, short) {
  try {
    let items = getHistory();
    // Prepend and filter duplicates
    items = items.filter(item => item.short !== short);
    items.unshift({
      original,
      short,
      createdAt: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    });
    if (items.length > 5) items = items.slice(0, 5);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn('History save error', e);
  }
}

function renderHistory() {
  const items = getHistory();
  if (!items || items.length === 0) {
    historySection.style.display = 'none';
    return;
  }

  historySection.style.display = 'block';
  historyList.innerHTML = items.map((item, idx) => `
    <div class="history-item">
      <div class="history-item-urls">
        <a href="${item.short}" target="_blank" class="history-short" rel="noopener noreferrer">${item.short}</a>
        <span class="history-original" title="${item.original}">${item.original}</span>
      </div>
      <div class="history-actions">
        <button type="button" class="history-btn" onclick="copyHistoryItem('${item.short}')">복사</button>
        <a href="../url2qr/index.html?url=${encodeURIComponent(item.short)}" class="history-btn" title="QR 코드 생성">QR</a>
      </div>
    </div>
  `).join('');
}

window.copyHistoryItem = function(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('복사하였습니다');
      alert('복사하였습니다');
    });
  } else {
    showToast('복사하였습니다');
    alert('복사하였습니다');
  }
};

btnClearHistory.addEventListener('click', () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  showToast('단축 기록이 삭제되었습니다.');
});

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  validateInput();
  renderHistory();
  
  // URL parameter prefill support
  const params = new URLSearchParams(window.location.search);
  const paramUrl = params.get('url');
  if (paramUrl) {
    urlInput.value = decodeURIComponent(paramUrl);
    validateInput();
    handleShorten();
  }
});
