/**
 * Extension Badge Manager
 * Updates Chrome extension badge with timer information
 */

let badgeInterval: NodeJS.Timeout | null = null;

/**
 * Format seconds to MM:SS for badge display
 */
function formatBadgeTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  // For badge, we want short format
  if (mins > 99) {
    return "99+";
  }

  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * Start showing timer in badge
 */
export function startTimerBadge(getElapsedSeconds: () => number) {
  // Clear any existing interval
  stopTimerBadge();

  // Set badge color to green
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' });

  // Update badge immediately
  updateBadge(getElapsedSeconds);

  // Update badge every second
  badgeInterval = setInterval(() => {
    updateBadge(getElapsedSeconds);
  }, 1000);
}

/**
 * Update badge with current time
 */
function updateBadge(getElapsedSeconds: () => number) {
  const seconds = getElapsedSeconds();
  const text = formatBadgeTime(seconds);

  chrome.action.setBadgeText({ text });
}

/**
 * Stop timer badge and clear display
 */
export function stopTimerBadge() {
  if (badgeInterval) {
    clearInterval(badgeInterval);
    badgeInterval = null;
  }

  // Clear badge text
  chrome.action.setBadgeText({ text: '' });
}

/**
 * Set badge to paused state (yellow)
 */
export function pauseTimerBadge(getElapsedSeconds: () => number) {
  // Clear interval but keep showing time
  if (badgeInterval) {
    clearInterval(badgeInterval);
    badgeInterval = null;
  }

  // Change color to yellow
  chrome.action.setBadgeBackgroundColor({ color: '#eab308' });

  // Update badge with current time (frozen)
  const seconds = getElapsedSeconds();
  const text = formatBadgeTime(seconds);
  chrome.action.setBadgeText({ text });
}

/**
 * Resume timer badge (back to green and updating)
 */
export function resumeTimerBadge(getElapsedSeconds: () => number) {
  startTimerBadge(getElapsedSeconds);
}
