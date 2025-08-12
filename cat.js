const catGif = document.getElementById("cat-gif");
const catSelect = document.getElementById("cat-select");

let selectedCat = localStorage.getItem("selectedCat") || "01";
catSelect.value = selectedCat;

if (!window.electronAPI) {
  console.error("[PixelPaws] electronAPI missing: check preload.js exposure");
}

// Debug image loading
catGif.addEventListener("error", (e) => {
  console.error(
    "[PixelPaws] <img> failed to load:",
    catGif?.src,
    e?.message || e
  );
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
let isPanelOpen = false;

let isChasing = false;
let chaseUntil = 0;
let mousePos = { x: 0, y: 0 };

let animationFrameId = null; // To manage requestAnimationFrame calls
let behaviorTimerId = null; // To manage scheduled random behaviors

// 고양이 집 상태 관리
let isInCatHouse = false;

// Fixed durations for idle poses
const SIT_DURATION_MS = 60000; // 1 minute
const LIEDOWN_DURATION_MS = 60000; // 1 minute
const JUMP_DURATION_MS = 600; // Jump animation duration before chasing
const JUMP_HEIGHT_PX = 24; // Vertical lift during jump
const LAND_DURATION_MS = 400; // Land animation duration before chasing
let isJumping = false; // prevent re-entrant jump
let mustWalkNext = false; // ensure movement after long rest
let firstBehavior = true; // force an early first action

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

  // Load from local assets only
  const resolve = (relPath) => {
    const catId = `cat${selectedCat}`;
    const newPath = relPath.replace(/cat\d\d/g, catId);
    return getPath(newPath.replace(/^\//, ""));
  };
  idleGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_idle_8fps.gif");
  walkGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_walk_8fps.gif");
  runGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_run_12fps.gif");
  liftedGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_wallgrab_8fps.gif"
  );
  attackGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_attack_12fps.gif"
  );
  sitGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_sit_8fps.gif");
  lieDownGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_liedown_8fps.gif"
  );
  jumpGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_jump_12fps.gif"
  );
  landGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_land_12fps.gif"
  );
  console.log("Attack GIF Path:", attackGif);
  console.log("Sit GIF Path:", sitGif);
  console.log("LieDown GIF Path:", lieDownGif);
  console.log("Jump GIF Path:", jumpGif);
  console.log("Land GIF Path:", landGif);

  const workAreaSize = (await window.electronAPI?.getWorkAreaSize?.()) || {
    width: 1920,
    height: 1080,
  };
  workAreaWidth = workAreaSize.width;
  workAreaHeight = workAreaSize.height;

  // Initial position (use saved position from localStorage if available, otherwise random)
  const savedPos = localStorage.getItem("catPosition");
  if (savedPos) {
    try {
      const pos = JSON.parse(savedPos);
      currentX = pos.x;
      currentY = pos.y;
    } catch (e) {
      // 저장된 위치가 유효하지 않으면 랜덤 위치 사용
      currentX = Math.random() * (workAreaWidth - catWidth);
      currentY = Math.random() * (workAreaHeight - catHeight);
    }
  } else {
    currentX = Math.random() * (workAreaWidth - catWidth);
    currentY = Math.random() * (workAreaHeight - catHeight);
  }
  try {
    window.electronAPI?.setWindowPosition?.(currentX, currentY);
  } catch (_) {}

  setIdle();
  mustWalkNext = true; // ensure we walk first rather than rest for 1min
  startCatBehavior();

  // No remote poller: purely local assets
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
  const start =
    typeof performance !== "undefined" && performance.now
      ? performance.now()
      : Date.now();

  const step = (nowTs) => {
    const now =
      nowTs ??
      (typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now());
    const elapsed = now - start;
    const t = Math.min(1, elapsed / JUMP_DURATION_MS);
    // Smooth up-and-down arc: 0 -> -H -> 0
    const offsetY = -JUMP_HEIGHT_PX * Math.sin(Math.PI * t);
    const y = baseY + offsetY;
    try {
      window.electronAPI?.setWindowPosition?.(currentX, y);
    } catch (_) {}

    if (t < 1 && !isDragging) {
      animationFrameId = requestAnimationFrame(step);
    } else {
      animationFrameId = null;
      // Restore baseline Y to prevent drift
      currentY = baseY;
      try {
        window.electronAPI?.setWindowPosition?.(currentX, currentY);
      } catch (_) {}
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

function doSleep() {
  setIdle();
  catGif.src = lieDownGif;
}

function getRandomWaitTime() {
  return Math.random() * (3000 - 1200) + 1200; // 1.2 to 3.0 seconds
}

function getRandomDestination() {
  targetX = Math.random() * (workAreaWidth - catWidth);
  targetY = Math.random() * (workAreaHeight - catHeight);
}

function startCatBehavior() {
  if (isDragging || isChasing || isPanelOpen) return; // Don't start new behavior if interacting or panel is open
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
  try {
    window.electronAPI?.setWindowPosition?.(currentX, currentY);
  } catch (_) {}
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

  try {
    window.electronAPI?.setWindowPosition?.(currentX, currentY);
  } catch (_) {}
  animationFrameId = requestAnimationFrame(moveCat);
}

const controlPanel = document.getElementById("control-panel");
const closePanelButton = document.getElementById("close-panel");
const openCatHouseButton = document.getElementById("open-cat-house");
const sleepButton = document.getElementById("sleep");
const goForAWalkButton = document.getElementById("go-for-a-walk");

catGif.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  isPanelOpen = true;
  setIdle(); // stop cat movement
  window.electronAPI.resizeWindow(128 + 200, 128);
  controlPanel.classList.remove("hidden");
});

function closeMenu() {
  isPanelOpen = false;
  controlPanel.classList.add("hidden");

  // 고양이 집 상태가 아닐 때만 배경화면 클래스 제거
  if (!isInCatHouse) {
    document.body.classList.remove("cat-house-open");
    window.electronAPI.resizeWindow(128, 128);
    // 창 투명도 복원
    window.electronAPI.restoreWindowTransparency();
  }

  startCatBehavior();
}

closePanelButton.addEventListener("click", () => {
  closeMenu();
});

openCatHouseButton.addEventListener("click", async () => {
  const rect = catGif.getBoundingClientRect();
  catGif.style.left = `${rect.left}px`;
  catGif.style.top = `${rect.top}px`;

  // 고양이 집 상태로 전환
  isInCatHouse = true;
  document.body.classList.add("cat-house-open");
  controlPanel.classList.add("fullscreen");

  // 화면 크기를 가져와서 창을 전체 크기로 조절
  const workAreaSize = await window.electronAPI.getWorkAreaSize();
  window.electronAPI.resizeWindow(workAreaSize.width, workAreaSize.height);

  // 창을 최상단 왼쪽으로 이동
  window.electronAPI.setWindowPosition(0, 0);

  //- 전체화면일 때만 보이는 버튼들
  openCatHouseButton.classList.add("hidden");
  sleepButton.classList.add("hidden");
  closePanelButton.classList.add("hidden");
  goForAWalkButton.classList.remove("hidden");
});

goForAWalkButton.addEventListener("click", async () => {
  // 현재 위치를 localStorage에 저장
  localStorage.setItem(
    "catPosition",
    JSON.stringify({ x: currentX, y: currentY })
  );

  // 고양이 집 상태 해제
  isInCatHouse = false;

  // 배경화면 클래스 제거
  document.body.classList.remove("cat-house-open");
  controlPanel.classList.remove("fullscreen");

  // 고양이 위치 초기화
  catGif.style.left = "";
  catGif.style.top = "";

  // 창 크기를 원래대로 복원
  window.electronAPI.resizeWindow(128, 128);

  // 창 투명도 복원
  await window.electronAPI.restoreWindowTransparency();

  //- 전체화면이 아닐 때만 보이는 버튼들
  openCatHouseButton.classList.remove("hidden");
  sleepButton.classList.remove("hidden");
  closePanelButton.classList.remove("hidden");
  goForAWalkButton.classList.add("hidden");

  // 메뉴 닫기 (closeMenu 함수 호출하지 않음)
  isPanelOpen = false;
  controlPanel.classList.add("hidden");

  // 고양이 행동 재시작
  startCatBehavior();

  // 창 크기 조절 후 마우스 이벤트 무시 설정
  setTimeout(() => {
    window.electronAPI.setIgnoreMouseEvents(false);
  }, 100);

  // 추가 지연 후 배경화면 클래스 강제 제거
  setTimeout(() => {
    document.body.classList.remove("cat-house-open");
  }, 200);

  // 마지막에 새로고침
  setTimeout(() => {
    window.location.reload();
  }, 300);
});

sleepButton.addEventListener("click", () => {
  closeMenu();
  doSleep();
});

catSelect.addEventListener("change", () => {
  selectedCat = catSelect.value;
  localStorage.setItem("selectedCat", selectedCat);
  const resolve = (relPath) => {
    const catId = `cat${selectedCat}`;
    const newPath = relPath.replace(/cat\d\d/g, catId);
    try {
      const u = new URL(newPath, location.href);
      return u.toString();
    } catch (e) {
      console.error("[PixelPaws] getAssetPath error:", e);
      return newPath;
    }
  };

  idleGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_idle_8fps.gif");
  walkGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_walk_8fps.gif");
  runGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_run_12fps.gif");
  liftedGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_wallgrab_8fps.gif"
  );
  attackGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_attack_12fps.gif"
  );
  sitGif = resolve("catset_assets/catset_gifs/cat01_gifs/cat01_sit_8fps.gif");
  lieDownGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_liedown_8fps.gif"
  );
  jumpGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_jump_12fps.gif"
  );
  landGif = resolve(
    "catset_assets/catset_gifs/cat01_gifs/cat01_land_12fps.gif"
  );

  setIdle(); // Reset to idle state with the new cat's GIF
});

// Poll mouse position ~60fps for chase mode
setInterval(async () => {
  try {
    const pos = (await window.electronAPI?.getMousePosition?.()) || mousePos;
    mousePos = pos;
  } catch (_) {}
}, 16);

init();
