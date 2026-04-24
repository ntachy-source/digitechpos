// Returns a stable, anonymous device fingerprint stored in localStorage.
const KEY = "sgh_device_id";

export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceLabel(): string {
  const ua = navigator.userAgent;
  // simple, friendly label
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS device";
  if (/Android/.test(ua)) return "Android device";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux";
  return "Web browser";
}
