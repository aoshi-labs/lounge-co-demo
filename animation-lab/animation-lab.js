const scene = document.querySelector(".scrub-scene");
const video = document.querySelector(".stage-video");
const overlay = document.querySelector(".scroll-fade-overlay");
const introCopy = document.querySelector(".intro-copy");
const copy = document.querySelector(".stage-copy");
const featurePanels = Array.from(document.querySelectorAll(".feature-panel"));
const scrollCue = document.querySelector(".scroll-cue");
const meterLabel = document.querySelector(".meter-label");
const meterFill = document.querySelector(".meter-fill");
const loopSection = document.querySelector(".loop-section");
const loopIntro = document.querySelector(".loop-reveal");
const loopNodes = document.querySelector(".loop-nodes");
const loopSteps = gsap.utils.toArray(".loop-step");
const loopPrivacy = document.querySelector(".loop-privacy");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let pendingProgress = 0;
let progressFrame = null;

function updateNav() {
  document.querySelector(".site-nav")?.classList.toggle("is-scrolled", window.scrollY > 48);
}

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({
  duration: 1.2,
  smoothWheel: true,
  smoothTouch: false,
});

window.labLenis = lenis;

lenis.on("scroll", ScrollTrigger.update);
lenis.on("scroll", updateNav);

gsap.ticker.add((time) => {
  lenis.raf(time * 1000);
});

gsap.ticker.lagSmoothing(0);

function setProgress(progress) {
  const percent = Math.round(progress * 100);
  meterFill.style.width = `${percent}%`;
  meterLabel.textContent = `${String(percent).padStart(2, "0")}%`;
  const shouldScrollUp = progress > 0.96;
  scrollCue.classList.toggle("is-up", shouldScrollUp);
  scrollCue.querySelector(".scroll-cue__text").textContent = shouldScrollUp ? "Scroll up" : "Scroll down";

  if (reducedMotion) {
    introCopy.style.opacity = 0;
    copy.style.opacity = 1;
    copy.style.transform = "none";
    featurePanels.forEach((panel) => {
      panel.style.opacity = "1";
      panel.style.transform = "none";
    });
    overlay.style.opacity = 0;
    return;
  }

  const introFadeInStart = 0.15;
  const introFadeInEnd = 0.25;
  const introFadeOutStart = 0.66;
  const introFadeOutEnd = 0.74;
  const introFadeIn = Math.min(1, Math.max(0, (progress - introFadeInStart) / (introFadeInEnd - introFadeInStart)));
  const introFadeOut = 1 - Math.min(1, Math.max(0, (progress - introFadeOutStart) / (introFadeOutEnd - introFadeOutStart)));
  const introOpacity = Math.min(introFadeIn, introFadeOut);
  introCopy.style.opacity = introOpacity;
  introCopy.style.transform = "none";

  const fadeInStart = 0.8;
  const fadeInEnd = 0.85;
  const fadeIn = Math.min(1, Math.max(0, (progress - fadeInStart) / (fadeInEnd - fadeInStart)));
  const copyOpacity = fadeIn;
  const entranceProgress = Math.min(1, Math.max(0, (progress - fadeInStart) / (fadeInEnd - fadeInStart)));
  const copyY = 24 - entranceProgress * 24;
  copy.style.opacity = copyOpacity;
  copy.style.transform = `translateY(${copyY}px)`;

  const panelStarts = [0.85, 0.9, 0.95];
  const panelFadeDistance = 0.05;
  featurePanels.forEach((panel, index) => {
    const panelProgress = Math.min(1, Math.max(0, (progress - panelStarts[index]) / panelFadeDistance));
    const easedPanelProgress = panelProgress * panelProgress * (3 - 2 * panelProgress);
    const panelY = 24 - easedPanelProgress * 24;
    panel.style.opacity = easedPanelProgress;
    panel.style.transform = `translateY(${panelY}px)`;
  });

  const fadeStart = 0.8;
  const linearFade = Math.max(0, (progress - fadeStart) / (1 - fadeStart));
  const easedFade = linearFade * linearFade * (3 - 2 * linearFade);
  overlay.style.opacity = easedFade;
}

window.labSetProgress = setProgress;
updateNav();

function requestProgress(progress) {
  pendingProgress = progress;

  if (progressFrame) {
    return;
  }

  progressFrame = requestAnimationFrame(() => {
    progressFrame = null;
    const duration = video.duration || 0;

    if (duration) {
      video.currentTime = pendingProgress * duration;
    }

    setProgress(pendingProgress);
  });
}

async function loadSeekableVideo() {
  const preferredSource = window.matchMedia("(max-width: 760px)").matches
    ? "./media/lounge-transition-home-mobile-premium.mp4"
    : "./media/lounge-transition-home-premium.mp4";

  if (!video.src || !video.src.includes(preferredSource.replace("./", ""))) {
    video.src = preferredSource;
  }

  video.preload = "auto";
  video.load();

  const source = await new Promise((resolve) => {
    const pickSource = () => resolve(video.currentSrc || video.querySelector("source")?.src || video.src);

    if (video.currentSrc) {
      pickSource();
      return;
    }

    video.addEventListener("loadedmetadata", pickSource, { once: true });
    video.addEventListener("error", pickSource, { once: true });
  });

  try {
    const response = await fetch(source);
    const blob = await response.blob();
    video.src = URL.createObjectURL(blob);
    video.load();
  } catch {
    // A real static host with range requests can scrub the direct source.
  }

  if (video.readyState < 1) {
    await new Promise((resolve) => {
      video.addEventListener("loadedmetadata", resolve, { once: true });
    });
  }
}

async function initScrollVideo() {
  await loadSeekableVideo();

  video.pause();
  video.currentTime = 0;
  setProgress(0);

  if (reducedMotion) {
    ScrollTrigger.refresh();
    return;
  }

  ScrollTrigger.create({
    trigger: scene,
    start: "top top",
    end: "+=3500",
    scrub: true,
    pin: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate(self) {
      requestProgress(self.progress);
    },
  });

  ScrollTrigger.refresh();
}

function initLoopAnimations() {
  if (!loopSection || !loopSteps.length || reducedMotion) {
    return;
  }

  if (loopIntro) {
    gsap.from(loopIntro, {
      opacity: 0,
      y: 28,
      duration: 0.8,
      ease: "power2.out",
      scrollTrigger: {
        trigger: loopSection,
        start: "top 78%",
        once: true,
      },
    });
  }

  if (loopNodes) {
    gsap.from(loopNodes, {
      opacity: 0,
      y: 18,
      duration: 0.7,
      ease: "power2.out",
      scrollTrigger: {
        trigger: loopSection,
        start: "top 74%",
        once: true,
      },
    });
  }

  gsap.fromTo(
    loopSteps,
    {
      opacity: 0.5,
      y: 26,
    },
    {
      opacity: 1,
      y: 0,
      stagger: 0.08,
      ease: "none",
      scrollTrigger: {
        trigger: loopSection,
        start: "top 96%",
        end: "top 78%",
        scrub: true,
      },
    }
  );

  if (loopPrivacy) {
    gsap.from(loopPrivacy, {
      opacity: 0,
      y: 20,
      duration: 0.72,
      ease: "power2.out",
      scrollTrigger: {
        trigger: loopPrivacy,
        start: "top 88%",
        once: true,
      },
    });
  }
}

initScrollVideo();
initLoopAnimations();
