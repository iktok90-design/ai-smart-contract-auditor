/* AuditSentry — micro-interactions
   - reveal-on-scroll
   - count-up animation for stats
   - terminal typing demo
   - copy-to-clipboard for code blocks
*/
(function () {
  "use strict";

  /* -------- Reveal-on-scroll via IntersectionObserver -------- */
  const reveals = document.querySelectorAll(".reveal, .reveal-stagger");
  if ("IntersectionObserver" in window && reveals.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" }
    );
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("in"));
  }

  /* -------- Count-up stats -------- */
  const counters = document.querySelectorAll("[data-count]");
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const animateCount = (el) => {
    const target = parseInt(el.dataset.count, 10);
    const dur = 1400;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const v = Math.floor(easeOut(t) * target);
      el.textContent = v;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = target;
    };
    requestAnimationFrame(tick);
  };
  if (counters.length && "IntersectionObserver" in window) {
    const cio = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            animateCount(e.target);
            cio.unobserve(e.target);
          }
        }
      },
      { threshold: 0.5 }
    );
    counters.forEach((el) => cio.observe(el));
  }

  /* -------- Terminal typing demo --------
     Re-runs as a loop. Lines have shape:
       { t: "prompt"|"cmd"|"out", text: "...", delay: 30 }
  */
  const terminal = document.querySelector("[data-terminal]");
  if (terminal) {
    const SCRIPT = [
      { t: "prompt", text: "auditsentry> ", delay: 0 },
      { t: "cmd",    text: "/audit examples/VulnerableVault.sol", delay: 18 },
      { t: "out",    text: "\n[1/5] inventory     1 file (56 LoC), Solidity 0.8.20", delay: 8 },
      { t: "out",    text: "\n[2/5] skills        running 5 detectors…", delay: 8 },
      { t: "out",    text: "\n[3/5] specialists   <span class='dim'>parallel:</span> attacker, defender", delay: 8 },
      { t: "out",    text: "\n[4/5] consolidate   6 findings", delay: 8 },
      { t: "out",    text: "\n[5/5] report        wrote auditsentry-reports/audit.md", delay: 8 },
      { t: "out",    text: "\n", delay: 0 },
      { t: "out",    text: "\n<span class='crit'>⛔ Critical</span>  REENT-001  Reentrancy in withdraw() drains vault", delay: 24 },
      { t: "out",    text: "\n<span class='warn'>⚠ High</span>      ACCESS-001 setPaused() missing access control", delay: 12 },
      { t: "out",    text: "\n<span class='warn'>⚠ High</span>      ACCESS-002 rescue() can drain user deposits", delay: 12 },
      { t: "out",    text: "\n<span class='warn'>⚠ High</span>      UNCHK-001  call() return value ignored", delay: 12 },
      { t: "out",    text: "\n<span class='dim'>◌ Med/Low</span>   2 additional findings", delay: 12 },
      { t: "out",    text: "\n", delay: 0 },
      { t: "out",    text: "\n<span class='accent'>Grade: F</span>   <span class='dim'>(critical reentrancy → /exploit REENT-001 to generate PoC)</span>", delay: 30 },
    ];

    const body = terminal.querySelector(".terminal-body");
    let cursorEl = terminal.querySelector(".cursor");

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const typeChars = async (parent, text, delay, className) => {
      const span = document.createElement("span");
      if (className) span.className = className;
      parent.appendChild(span);
      // If text contains HTML tags, write all at once (still feels fast)
      if (text.includes("<")) {
        span.innerHTML = text;
        return;
      }
      for (let i = 0; i < text.length; i++) {
        span.textContent += text[i];
        if (delay > 0) await sleep(delay);
      }
    };

    const runOnce = async () => {
      // Clear
      body.innerHTML = '<span class="cursor"></span>';
      cursorEl = body.querySelector(".cursor");

      for (const step of SCRIPT) {
        // remove cursor while typing then re-attach
        if (cursorEl) cursorEl.remove();
        const cls = step.t === "prompt" ? "term-prompt"
                  : step.t === "cmd"    ? "term-cmd"
                  : "term-out";
        await typeChars(body, step.text, step.delay, cls);
        cursorEl = document.createElement("span");
        cursorEl.className = "cursor";
        body.appendChild(cursorEl);
      }
      await sleep(4500);
    };

    const loop = async () => {
      try {
        while (true) {
          await runOnce();
        }
      } catch {
        /* tab hidden, etc. */
      }
    };

    // Start when in viewport (so it doesn't run silently below the fold)
    if ("IntersectionObserver" in window) {
      const tio = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              loop();
              tio.disconnect();
            }
          }
        },
        { threshold: 0.3 }
      );
      tio.observe(terminal);
    } else {
      loop();
    }
  }

  /* -------- Copy-to-clipboard for code blocks -------- */
  document.querySelectorAll(".code-block").forEach((block) => {
    const btn = document.createElement("button");
    btn.className = "copy";
    btn.textContent = "copy";
    btn.addEventListener("click", async () => {
      const code = block.querySelector("code");
      const text = code ? code.textContent : block.textContent;
      try {
        await navigator.clipboard.writeText(text.trim());
        btn.textContent = "copied";
        btn.classList.add("copied");
        setTimeout(() => {
          btn.textContent = "copy";
          btn.classList.remove("copied");
        }, 1500);
      } catch {
        btn.textContent = "fail";
      }
    });
    block.appendChild(btn);
  });

  /* -------- Subtle parallax on hero deco -------- */
  const deco = document.querySelector(".hero-deco");
  if (deco && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.addEventListener(
      "scroll",
      () => {
        const y = window.scrollY;
        if (y < 800) {
          deco.style.transform = `translateY(${y * 0.18}px) rotate(${-8 + y * 0.02}deg)`;
        }
      },
      { passive: true }
    );
  }
})();
