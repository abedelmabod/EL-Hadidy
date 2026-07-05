export const isYoutubeUrl = (url = '') => /youtu\.be|youtube\.com/.test(String(url));

export const isDriveUrl = (url = '') => /drive\.google\.com|docs\.google\.com/.test(String(url));

export const BUNNY_WEB_CONFIG = {
  streamDomain: 'vz-5db52be9-935.b-cdn.net',
  tokenSecurityKey: 'afe36c3e-2b1b-426f-9cbb-2966bf0fbdb3',
  playbackTokenTtlSeconds: 4 * 60 * 60,
};

export const isBunnyUrl = (url = '') => /iframe\.mediadelivery\.net\/embed\/|player\.mediadelivery\.net\/embed\/|\.b-cdn\.net/i.test(String(url || ''));

export const isBunnyEmbedUrl = (url = '') => /(?:iframe|player)\.mediadelivery\.net\/embed\//i.test(String(url || ''));

export const extractYoutubeId = (url = '') => {
  if (!url) return '';
  try {
    const normalized = String(url).startsWith('http') ? String(url) : `https://${url}`;
    const parsed = new URL(normalized);
    const hostname = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
    const pathname = parsed.pathname || '';

    if (hostname === 'youtu.be') return pathname.split('/').filter(Boolean)[0] || '';
    if (!hostname.endsWith('youtube.com')) return '';
    if (pathname.startsWith('/watch')) return parsed.searchParams.get('v') || '';
    if (pathname.startsWith('/shorts/')) return pathname.split('/').filter(Boolean)[1] || '';
    if (pathname.startsWith('/live/')) return pathname.split('/').filter(Boolean)[1] || '';
    if (pathname.startsWith('/embed/')) return pathname.split('/').filter(Boolean)[1] || '';
    if (pathname.startsWith('/v/')) return pathname.split('/').filter(Boolean)[1] || '';
  } catch {
    return '';
  }
  return '';
};

export const extractDriveId = (url = '') => {
  if (!url) return '';
  try {
    const normalized = String(url).startsWith('http') ? String(url) : `https://${url}`;
    const parsed = new URL(normalized);
    const pathname = parsed.pathname || '';
    const match = pathname.match(/\/file\/d\/([^/]+)/) || pathname.match(/\/d\/([^/]+)/);
    if (match?.[1]) return match[1];
    return parsed.searchParams.get('id') || '';
  } catch {
    return '';
  }
};

const sha256Hex = async (value) => {
  const data = new TextEncoder().encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const getBunnyPlaybackExpires = () => Math.floor(Date.now() / 1000) + BUNNY_WEB_CONFIG.playbackTokenTtlSeconds;

const appendQueryParams = (url, params = {}) => {
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  });
  return url.toString();
};

export const signBunnyStreamEmbedUrl = async (embedUrl = '', videoId = '', expires = getBunnyPlaybackExpires()) => {
  if (!BUNNY_WEB_CONFIG.tokenSecurityKey || !videoId) return embedUrl;
  const parsedUrl = new URL(embedUrl);
  parsedUrl.searchParams.delete('token');
  parsedUrl.searchParams.delete('expires');
  const token = await sha256Hex(`${BUNNY_WEB_CONFIG.tokenSecurityKey}${videoId}${expires}`);
  return appendQueryParams(parsedUrl, { token, expires });
};

export const signBunnyCdnUrl = async (playbackUrl = '', expires = getBunnyPlaybackExpires()) => {
  if (!BUNNY_WEB_CONFIG.tokenSecurityKey) return playbackUrl;
  const parsedUrl = new URL(playbackUrl);
  parsedUrl.searchParams.delete('token');
  parsedUrl.searchParams.delete('expires');
  parsedUrl.searchParams.delete('token_path');
  const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0];
  if (!videoId) return playbackUrl;
  const token = await sha256Hex(`${BUNNY_WEB_CONFIG.tokenSecurityKey}/${videoId}/${expires}`);
  if (/\.m3u8$/i.test(parsedUrl.pathname)) {
    return `${parsedUrl.origin}/${videoId}/playlist.m3u8?token=${token}&expires=${expires}`;
  }
  return appendQueryParams(parsedUrl, { token, expires });
};

export const resolveBunnyPlaybackUrl = async (url = '') => {
  const raw = String(url || '').trim();
  if (!raw) return '';

  if (isBunnyEmbedUrl(raw)) {
    try {
      const parsedUrl = new URL(raw);
      const parts = parsedUrl.pathname.split('/').filter(Boolean);
      const videoId = parts[2];
      if (videoId) return signBunnyStreamEmbedUrl(raw, videoId);
    } catch {
      return raw;
    }
  }

  if (/\.b-cdn\.net/i.test(raw)) {
    try {
      return signBunnyCdnUrl(raw);
    } catch {
      return raw;
    }
  }

  return raw;
};

export const getEmbeddableVideoUrl = (url = '') => {
  if (isYoutubeUrl(url)) {
    const id = extractYoutubeId(url);
    if (!id) return '';
    return `https://www.youtube-nocookie.com/embed/${id}?enablejsapi=1&rel=0&modestbranding=1&iv_load_policy=3&playsinline=1`;
  }

  if (isDriveUrl(url)) {
    const id = extractDriveId(url);
    if (!id) return '';
    return `https://drive.google.com/file/d/${id}/preview`;
  }

  return url || '';
};

export const isEmbeddedVideoUrl = (url = '') => isYoutubeUrl(url) || isDriveUrl(url) || isBunnyEmbedUrl(url);

export const detectVideoKind = (url = '') => {
  if (isYoutubeUrl(url)) return 'youtube';
  if (isDriveUrl(url)) return 'google_drive';
  if (isBunnyUrl(url)) return 'bunny';
  return 'direct';
};
