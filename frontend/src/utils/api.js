export const getApiBase = () => {
  let url = import.meta.env.VITE_API_BASE;
  
  // Clean up common copy-paste issues like "url1 -> url2" or concatenated strings
  if (url && url.includes('->')) {
    const parts = url.split('->');
    url = parts[parts.length - 1].trim();
  }
  
  // If the URL contains multiple http/https prefixes, extract the last valid one
  if (url) {
    const lastHttp = url.lastIndexOf('http://');
    const lastHttps = url.lastIndexOf('https://');
    const lastIndex = Math.max(lastHttp, lastHttps);
    if (lastIndex > 0) {
      url = url.substring(lastIndex);
    }
  }

  // Verify it's a valid URL
  try {
    if (url) {
      new URL(url);
      return url;
    }
  } catch (e) {
    console.warn("Invalid VITE_API_BASE URL, falling back:", url);
  }

  // Fallback options
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  
  // Dynamic Render URL mapping (e.g. sddds-frontend.onrender.com -> sddds-backend.onrender.com)
  if (window.location.hostname.endsWith('.onrender.com')) {
    const baseHost = window.location.hostname.replace('-frontend', '-backend');
    return `https://${baseHost}`;
  }

  return 'http://localhost:5000';
};

export const API_BASE = getApiBase();
export const API_URL = `${API_BASE}/api`;
