const catGif = document.getElementById("cat-gif");

if (!window.electronAPI) {
  console.error("[PixelPaws] electronAPI missing: check preload.js exposure");
}

// Debug image loading
catGif.addEventListener("error", (e) => {
  console.error("[PixelPaws] <img> failed to load:", catGif?.src, e?.message || e);
});
catGif.addEventListener("load", () => {
  console.log("[PixelPaws] <img> loaded:", catGif?.src);
});

let idleGif;
let walkGif;
let runGif;
let liftedGif;
let attackGif; // New: Attack GIF
let sitGif; // New: Sit GIF
let lieDownGif; // New: Lie down GIF
let jumpGif; // New: Jump GIF
let landGif; // New: Land GIF

let currentX = 0;
let currentY = 0;
let targetX = 0;
let targetY = 0;
let isWalking = false;
let workAreaWidth = 0;
let workAreaHeight = 0;

const catWidth = 128;
const catHeight = 128;

// Interaction state
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let movedDuringDrag = false;

let isChasing = false;
let chaseUntil = 0;
let mousePos = { x: 0, y: 0 };

let animationFrameId = null; // To manage requestAnimationFrame calls
let behaviorTimerId = null; // To manage scheduled random behaviors

// Fixed durations for idle poses
const SIT_DURATION_MS = 60000; // 1 minute
const LIEDOWN_DURATION_MS = 60000; // 1 minute
const JUMP_DURATION_MS = 600; // Jump animation duration before chasing
const JUMP_HEIGHT_PX = 24; // Vertical lift during jump
const LAND_DURATION_MS = 400; // Land animation duration before chasing
let isJumping = false; // prevent re-entrant jump
let remoteManifest = null; // cached remote
let mustWalkNext = false; // ensure movement after long rest
let firstBehavior = true; // force an early first action
let visibilityPollTimer = null;
let remotePollRetryTimer = null;

function clearBehaviorTimer() {
  if (behaviorTimerId) {
    clearTimeout(behaviorTimerId);
    behaviorTimerId = null;
  }
}

async function init() {
  // Get absolute paths for GIFs
  const getPath = (rel) => {
    try {
      // Temporarily avoid preload dependency: use file URL by default
      const u = new URL(rel, location.href);
      return u.toString();
    } catch (e) {
      console.error("[PixelPaws] getAssetPath error:", e);
    }
    return rel; // fallback
  };

  // Try remote manifest first
  const remote = await loadRemoteManifestSafe(1200); // do not block startup too long
  const base = remote?.baseUrl || "";
  const resolve = (p) => (base ? base.replace(/\/$/, "") + "/" + p.replace(/^\//, "") : getPath(p));

  idleGif = resolve(remote?.files?.idle || "catset_assets/catset_gifs/cat01_gifs/cat01_idle_8fps.gif");
  walkGif = resolve(remote?.files?.walk || "catset_assets/catset_gifs/cat01_gifs/cat01_walk_8fps.gif");
  console.log("Walk GIF Path:", walkGif);
  runGif = resolve(remote?.files?.run || "catset_assets/catset_gifs/cat01_gifs/cat01_run_12fps.gif");
  console.log("Run GIF Path:", runGif);
  liftedGif = resolve(remote?.files?.lifted || "catset_assets/catset_gifs/cat01_gifs/cat01_fright_12fps.gif");
  attackGif = resolve(remote?.files?.attack || "catset_assets/catset_gifs/cat01_gifs/cat01_attack_12fps.gif");
  sitGif = resolve(remote?.files?.sit || "catset_assets/catset_gifs/cat01_gifs/cat01_sit_8fps.gif");
  lieDownGif = resolve(remote?.files?.liedown || "catset_assets/catset_gifs/cat01_gifs/cat01_liedown_8fps.gif");
  jumpGif = resolve(remote?.files?.jump || "catset_assets/catset_gifs/cat01_gifs/cat01_jump_12fps.gif");
  landGif = resolve(remote?.files?.land || "catset_assets/catset_gifs/cat01_gifs/cat01_land_12fps.gif");
  console.log("Attack GIF Path:", attackGif);
  console.log("Sit GIF Path:", sitGif);
  console.log("LieDown GIF Path:", lieDownGif);
  console.log("Jump GIF Path:", jumpGif);
  console.log("Land GIF Path:", landGif);

  const workAreaSize = (await window.electronAPI?.getWorkAreaSize?.()) || { width: 1920, height: 1080 };
  workAreaWidth = workAreaSize.width;
  workAreaHeight = workAreaSize.height;

  // Initial position (randomly within the work area)
  currentX = Math.random() * (workAreaWidth - catWidth);
  currentY = Math.random() * (workAreaHeight - catHeight);
  try { window.electronAPI?.setWindowPosition?.(currentX, currentY); } catch (_) {}

  // Poll mouse position ~60fps for chase mode
  setInterval(async () => {
    try {
      const pos = (await window.electronAPI?.getMousePosition?.()) || mousePos;
      mousePos = pos;
    } catch (_) {}
  }, 16);

  setIdle();
  mustWalkNext = true; // ensure we walk first rather than rest for 1min
  startCatBehavior();

  // Remote visibility/cat selection poller
  startRemotePoller();
}

function cancelAnimFrame() {
  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function setIdle() {
  clearBehaviorTimer();
  cancelAnimFrame();
  catGif.src = idleGif;
  isWalking = false;
  isChasing = false;
}

function setWalk() {
  clearBehaviorTimer();
  cancelAnimFrame();
  catGif.src = walkGif;
  isWalking = true;
  isChasing = false;
}

function setRun() {
  clearBehaviorTimer();
  cancelAnimFrame();
  catGif.src = runGif;
  isWalking = false;
  isChasing = true;
}

function setLifted() {
  clearBehaviorTimer();
  cancelAnimFrame();
  catGif.src = liftedGif;
  isWalking = false;
  isChasing = false;
}

// New: Set Attack animation
function setAttack() {
  clearBehaviorTimer();
  cancelAnimFrame();
  catGif.src = attackGif;
  isWalking = false;
  isChasing = false;
}

// New: Jump then chase
function doJumpThenChase(durationMs) {
  if (isJumping) return;
  isJumping = true;
  clearBehaviorTimer();
  cancelAnimFrame();
  isWalking = false;
  isChasing = false;
  catGif.src = jumpGif;

  const baseY = currentY;
  const start = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();

  const step = (nowTs) => {
    const now = nowTs ?? ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now());
    const elapsed = now - start;
    const t = Math.min(1, elapsed / JUMP_DURATION_MS);
    // Smooth up-and-down arc: 0 -> -H -> 0
    const offsetY = -JUMP_HEIGHT_PX * Math.sin(Math.PI * t);
    const y = baseY + offsetY;
    try { window.electronAPI?.setWindowPosition?.(currentX, y); } catch (_) {}

    if (t < 1 && !isDragging) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      animationFrameId = null;
      // Restore baseline Y to prevent drift
      currentY = baseY;
      try { window.electronAPI?.setWindowPosition?.(currentX, currentY); } catch (_) {}
      // Play land animation briefly, then chase
      if (!isDragging) {
        catGif.src = landGif;
        setTimeout(() => {
          isJumping = false;
          if (!isDragging) startChase(durationMs);
        }, LAND_DURATION_MS);
      } else {
        isJumping = false;
      }
    }
  };

  animationFrameId = requestAnimationFrame(step);
}

// New: Set Sit animation for a duration, then resume
function doSit(durationMs) {
  setIdle(); // ensure no rafs/timers
  catGif.src = sitGif;
  mustWalkNext = true;
  behaviorTimerId = setTimeout(() => {
    setIdle();
    startCatBehavior();
  }, durationMs);
}

// New: Set LieDown animation for a duration, then resume
function doLieDown(durationMs) {
  setIdle(); // ensure no rafs/timers
  catGif.src = lieDownGif;
  mustWalkNext = true;
  behaviorTimerId = setTimeout(() => {
    setIdle();
    startCatBehavior();
  }, durationMs);
}

function getRandomWaitTime() {
  return Math.random() * (3000 - 1200) + 1200; // 1.2 to 3.0 seconds
}

function getRandomInRange(minMs, maxMs) {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

function getRandomDestination() {
  targetX = Math.random() * (workAreaWidth - catWidth);
  targetY = Math.random() * (workAreaHeight - catHeight);
}

function startCatBehavior() {
  if (isDragging || isChasing) return; // Don't start new behavior if interacting
  clearBehaviorTimer();
  const delay = firstBehavior ? 400 : getRandomWaitTime();
  firstBehavior = false;
  behaviorTimerId = setTimeout(() => {
    if (isDragging || isChasing) return;
    // Weighted random: walk 60%, sit 20%, lieDown 20%
    const r = Math.random();
    if (mustWalkNext || r < 0.6) {
      mustWalkNext = false;
      getRandomDestination();
      setWalk();
      animationFrameId = requestAnimationFrame(moveCat);
    } else if (r < 0.8) {
      doSit(SIT_DURATION_MS);
    } else {
      doLieDown(LIEDOWN_DURATION_MS);
    }
  }, getRandomWaitTime());
}

// --- Mouse interactions ---

// Begin drag: pick up the cat window and move it with the mouse
catGif.addEventListener("mousedown", (e) => {
  isDragging = true;
  movedDuringDrag = false;
  // Offset within the window where the mouse grabbed
  dragOffsetX = e.clientX;
  dragOffsetY = e.clientY;
  // Do not change animation yet; wait until actual movement starts
  window.electronAPI?.setIgnoreMouseEvents?.(false); // Capture mouse events for dragging
  e.preventDefault();
});

// Drag move
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const newX = e.screenX - dragOffsetX;
  const newY = e.screenY - dragOffsetY;
  const exceeded = Math.abs(newX - currentX) + Math.abs(newY - currentY) > 8; // more forgiving drag threshold
  if (!movedDuringDrag && exceeded) {
    // Transition out of sit/lie only when actual move begins
    setLifted();
  }
  movedDuringDrag = movedDuringDrag || exceeded;
  currentX = newX;
  currentY = newY;
  try { window.electronAPI?.setWindowPosition?.(currentX, currentY); } catch (_) {}
});

// End drag
window.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  // Keep the window interactive after drag ends
  window.electronAPI?.setIgnoreMouseEvents?.(false);
  setIdle();
  startCatBehavior();
});

// Click to jump once, then chase the mouse for 5 seconds (ignore if it was a drag)
catGif.addEventListener("click", () => {
  if (movedDuringDrag || isJumping) return; // was a drag, not a click, or already jumping
  doJumpThenChase(5000);
});

function startChase(durationMs) {
  setRun();
  chaseUntil = Date.now() + durationMs;
  animationFrameId = requestAnimationFrame(chaseLoop);
}

function onCatchMouse() {
  isChasing = false; // Stop chasing
  setAttack(); // Play attack animation

  // After a short delay, return to idle and resume normal behavior
  setTimeout(() => {
    setIdle();
    startCatBehavior();
  }, 700); // Adjust delay based on attack GIF duration
}

function chaseLoop() {
  if (!isChasing) return;

  const now = Date.now();
  if (now > chaseUntil) {
    // timeout -> stop chasing and resume idle/walk scheduler
    setIdle();
    startCatBehavior();
    return;
  }

  const speed = 5; // Faster speed for chasing
  const dxm = mousePos.x - (currentX + catWidth / 2); // Center of cat to mouse
  const dym = mousePos.y - (currentY + catHeight / 2);
  const distm = Math.hypot(dxm, dym);

  // Move towards current mouse position
  if (distm > speed) {
    const ang = Math.atan2(dym, dxm);
    currentX += Math.cos(ang) * speed;
    currentY += Math.sin(ang) * speed;
    catGif.style.transform = `scaleX(${dxm < 0 ? -1 : 1})`;
    window.electronAPI?.setWindowPosition?.(currentX, currentY);
    animationFrameId = requestAnimationFrame(chaseLoop);
  } else {
    // "Caught" the mouse
    onCatchMouse();
  }
}

function moveCat() {
  if (!isWalking) return; // Only move if in walking state

  const speed = 2; // Pixels per frame for normal walk
  const dx = targetX - currentX;
  const dy = targetY - currentY;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < speed) {
    currentX = targetX;
    currentY = targetY;
    window.electronAPI.setWindowPosition(currentX, currentY);
    setIdle();
    startCatBehavior();
    return;
  }

  const angle = Math.atan2(dy, dx);
  currentX += Math.cos(angle) * speed;
  currentY += Math.sin(angle) * speed;

  // Flip image based on horizontal direction
  if (dx < 0) {
    catGif.style.transform = "scaleX(-1)";
  } else {
    catGif.style.transform = "scaleX(1)";
  }

  try { window.electronAPI?.setWindowPosition?.(currentX, currentY); } catch (_) {}
  animationFrameId = requestAnimationFrame(moveCat);
}

init();
// --- Remote control: poll visibility and selection from SaaS ---
async function startRemotePoller() {
  clearInterval(visibilityPollTimer);
  if (remotePollRetryTimer) {
    clearTimeout(remotePollRetryTimer);
    remotePollRetryTimer = null;
  }
  const deviceId = await window.electronAPI?.getDeviceId?.();
  const cfg0 = await window.electronAPI?.getConfig?.();
  if (!deviceId || !cfg0?.apiBase || !cfg0?.apiToken) {
    // Retry later until config is provided
    remotePollRetryTimer = setTimeout(startRemotePoller, 2000);
    return;
  }

  // One-time device registration/upsert so DB has a row
  try {
    const base0 = cfg0.apiBase.replace(/\/$/, "");
    const url0 = `${base0}/v1/devices/${encodeURIComponent(deviceId)}/state`;
    await fetch(url0, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg0.apiToken}`,
      },
      body: JSON.stringify({
        visible: true,
        selectedCatId: cfg0.selectedCatId || null,
      }),
    });
  } catch (_) {}

  const tick = async () => {
    try {
      // Fetch latest config each tick to reflect updates without restart
      const cfg = await window.electronAPI?.getConfig?.();
      if (!cfg?.apiBase || !cfg?.apiToken) return;
      const base = cfg.apiBase.replace(/\/$/, "");
      const url = `${base}/v1/devices/${encodeURIComponent(deviceId)}/state`;
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${cfg.apiToken}` } });
      if (!resp.ok) return;
      const data = await resp.json();
      // expected: { visible: boolean, selectedCatId?: string }
      if (typeof data.visible === "boolean") {
        await window.electronAPI?.setWindowVisibility?.(data.visible);
      }
      if (data.selectedCatId && data.selectedCatId !== cfg.selectedCatId) {
        await window.electronAPI?.setConfig?.({ selectedCatId: data.selectedCatId });
        remoteManifest = null; // invalidate cache
        // reload assets seamlessly
        await reloadAssetsFromRemote();
      }
    } catch (_) {}
  };

  visibilityPollTimer = setInterval(tick, 3000);
  tick();
}

async function reloadAssetsFromRemote() {
  const remote = await loadRemoteManifestSafe(1500);
  if (!remote) return;
  const base = remote?.baseUrl || "";
  const resolve = (p) => (base ? base.replace(/\/$/, "") + "/" + p.replace(/^\//, "") : p);
  idleGif = resolve(remote?.files?.idle || idleGif);
  walkGif = resolve(remote?.files?.walk || walkGif);
  runGif = resolve(remote?.files?.run || runGif);
  liftedGif = resolve(remote?.files?.lifted || liftedGif);
  attackGif = resolve(remote?.files?.attack || attackGif);
  sitGif = resolve(remote?.files?.sit || sitGif);
  lieDownGif = resolve(remote?.files?.liedown || lieDownGif);
  jumpGif = resolve(remote?.files?.jump || jumpGif);
  landGif = resolve(remote?.files?.land || landGif);
  // reflect current state image immediately
  const currentSrc = { idle: idleGif, walk: walkGif, run: runGif }[
    isChasing ? "run" : isWalking ? "walk" : "idle"
  ];
  if (currentSrc) catGif.src = currentSrc;
}

// --- SaaS: load remote manifest helpers ---
async function loadRemoteManifestSafe(timeoutMs) {
  try {
    if (remoteManifest) return remoteManifest;
    const cfg = await window.electronAPI?.getConfig?.();
    if (!cfg?.apiBase || !cfg?.selectedCatId) return null;
    const url = `${cfg.apiBase.replace(/\/$/, "")}/v1/cats/${encodeURIComponent(cfg.selectedCatId)}/manifest`;
    const controller = new AbortController();
    const t = timeoutMs ? setTimeout(() => controller.abort("timeout"), timeoutMs) : null;
    const resp = await fetch(url, {
      headers: cfg.apiToken ? { Authorization: `Bearer ${cfg.apiToken}` } : undefined,
      signal: controller.signal,
    }).finally(() => t && clearTimeout(t));
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    // expected: { baseUrl: string, files: { idle, walk, run, lifted, attack, sit, liedown, jump, land } }
    remoteManifest = data;
    return data;
  } catch (e) {
    console.warn("[PixelPaws] remote manifest load failed:", e);
    return null;
  }
}
