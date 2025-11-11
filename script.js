/* =========================================================================
   script.js — Typing Race + improved glowing ink (updated per request)
   - random neon color for each floating letter
   - smaller, fast-fading ink bursts (no full-screen white)
   - responsive larger letter sizes
   ========================================================================= */

/* -------------------------
   Typing game data & DOM refs
   ------------------------- */
const textBank = {
  easy: ["The quick brown fox jumps over the lazy dog.","Hello world! This is a simple test."],
  medium: [
    "Typing games help improve your keyboard accuracy and speed while making the learning process enjoyable and competitive.",
    "Practice your fingers—each keystroke is a lap in this thrilling racing experience."
  ],
  hard: [
    "Consistent training and deliberate practice are crucial factors for honing typing proficiency and achieving high-speed performance across diverse typographic contexts.",
    "Leveraging muscle memory, strategic pacing, and mindful error management can significantly elevate your overall typing competence beyond baseline expectations."
  ]
};

let currentDifficulty = 'easy', currentText='', startTime=null, timerInterval=null;
let typedChars=0, correctChars=0, totalChars=0, carPosition=0, prevInputValue='';

const textDisplay = document.getElementById('text-display');
const inputField = document.getElementById('input-field');
const wpmDisplay = document.getElementById('wpm');
const accDisplay = document.getElementById('acc');
const timerDisplay = document.getElementById('timer');
const overlay = document.getElementById('overlay');
const finalWPM = document.getElementById('final-wpm');
const finalAcc = document.getElementById('final-acc');
const finalTime = document.getElementById('final-time');
const restartBtn = document.getElementById('restart-btn');
const diffButtons = document.querySelectorAll('.diff-btn');

/* ============================
   Fluid solver (Stable Fluids)
   ============================ */
const N = 112; // slightly lower for smoother/less dramatic spread
const size = (N+2)*(N+2);

// velocity fields
let u = new Float32Array(size), v = new Float32Array(size);
let u_prev = new Float32Array(size), v_prev = new Float32Array(size);

// dye fields
let dyeR = new Float32Array(size), dyeG = new Float32Array(size), dyeB = new Float32Array(size);
let dyeR_prev = new Float32Array(size), dyeG_prev = new Float32Array(size), dyeB_prev = new Float32Array(size);

/* TUNABLE PARAMETERS (change these to control spread / fade) */
let diffusion = 0.000018;   // smaller => less spreading
let viscosity = 0.00003;    // slightly higher for smoother motion
let dt = 0.9;
let fade = 0.985;           // lower => faster fade so one-off bursts vanish quickly
let iterations = 16;

const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let canvasW = canvas.width = innerWidth, canvasH = canvas.height = innerHeight;
window.addEventListener('resize', () => { canvasW = canvas.width = innerWidth; canvasH = canvas.height = innerHeight; });

function IX(i,j){ return i + (N+2)*j; }

function set_bnd(b, x){
  for(let i=1;i<=N;i++){
    x[IX(i,0)]   = b===2 ? -x[IX(i,1)] : x[IX(i,1)];
    x[IX(i,N+1)] = b===2 ? -x[IX(i,N)] : x[IX(i,N)];
  }
  for(let j=1;j<=N;j++){
    x[IX(0,j)]   = b===1 ? -x[IX(1,j)] : x[IX(1,j)];
    x[IX(N+1,j)] = b===1 ? -x[IX(N,j)] : x[IX(N,j)];
  }
  x[IX(0,0)]       = 0.5*(x[IX(1,0)] + x[IX(0,1)]);
  x[IX(0,N+1)]     = 0.5*(x[IX(1,N+1)] + x[IX(0,N)]);
  x[IX(N+1,0)]     = 0.5*(x[IX(N,0)] + x[IX(N+1,1)]);
  x[IX(N+1,N+1)]   = 0.5*(x[IX(N,N+1)] + x[IX(N+1,N)]);
}

function lin_solve(b, x, x0, a, c){
  for(let k=0;k<iterations;k++){
    for(let j=1;j<=N;j++){
      for(let i=1;i<=N;i++){
        x[IX(i,j)] = (x0[IX(i,j)] + a*( x[IX(i-1,j)] + x[IX(i+1,j)] + x[IX(i,j-1)] + x[IX(i,j+1)] )) / c;
      }
    }
    set_bnd(b,x);
  }
}

function diffuse(b, x, x0, diff){
  const a = dt * diff * N * N;
  lin_solve(b, x, x0, a, 1 + 4*a);
}

function advect(b, d, d0, ufield, vfield){
  const dt0 = dt * N;
  for(let j=1;j<=N;j++){
    for(let i=1;i<=N;i++){
      let x = i - dt0 * ufield[IX(i,j)];
      let y = j - dt0 * vfield[IX(i,j)];
      if(x < 0.5) x = 0.5; if(x > N + 0.5) x = N + 0.5;
      const i0 = Math.floor(x), i1 = i0 + 1;
      if(y < 0.5) y = 0.5; if(y > N + 0.5) y = N + 0.5;
      const j0 = Math.floor(y), j1 = j0 + 1;
      const s1 = x - i0, s0 = 1 - s1;
      const t1 = y - j0, t0 = 1 - t1;
      d[IX(i,j)] = s0*(t0*d0[IX(i0,j0)] + t1*d0[IX(i0,j1)]) + s1*(t0*d0[IX(i1,j0)] + t1*d0[IX(i1,j1)]);
    }
  }
  set_bnd(b,d);
}

function project(u, v, p, div){
  for(let j=1;j<=N;j++){
    for(let i=1;i<=N;i++){
      div[IX(i,j)] = -0.5*( u[IX(i+1,j)] - u[IX(i-1,j)] + v[IX(i,j+1)] - v[IX(i,j-1)] ) / N;
      p[IX(i,j)] = 0;
    }
  }
  set_bnd(0,div); set_bnd(0,p);
  lin_solve(0,p,div,1,4);
  for(let j=1;j<=N;j++){
    for(let i=1;i<=N;i++){
      u[IX(i,j)] -= 0.5 * N * (p[IX(i+1,j)] - p[IX(i-1,j)]);
      v[IX(i,j)] -= 0.5 * N * (p[IX(i,j+1)] - p[IX(i,j-1)]);
    }
  }
  set_bnd(1,u); set_bnd(2,v);
}

function vel_step(u, v, u0, v0, visc){
  for(let i=0;i<size;i++){ u[i] += u0[i]; v[i] += v0[i]; u0[i]=0; v0[i]=0; }
  diffuse(1, u0, u, visc); diffuse(2, v0, v, visc);
  advect(1, u, u0, u, v); advect(2, v, v0, u, v);
  project(u, v, u0, v0);
}

function dens_step(r,g,b, r0,g0,b0, diff){
  for(let i=0;i<size;i++){
    r[i] += r0[i]; g[i] += g0[i]; b[i] += b0[i];
    r0[i] = g0[i] = b0[i] = 0;
  }
  diffuse(0, r0, r, diff); diffuse(0, g0, g, diff); diffuse(0, b0, b, diff);
  advect(0, r, r0, u, v); advect(0, g, g0, u, v); advect(0, b, b0, u, v);
  for(let i=0;i<size;i++){ r[i]*=fade; g[i]*=fade; b[i]*=fade; }
}

/* ============================
   Add density & velocity helpers
   ============================ */

function addDensity(xw,yw, amountR, amountG, amountB){
  const i = Math.floor((xw / canvasW) * N) + 1;
  const j = Math.floor((yw / canvasH) * N) + 1;
  const radius = 2 + Math.floor(Math.random()*2); // smaller radius
  for(let jj = j - radius; jj <= j + radius; jj++){
    for(let ii = i - radius; ii <= i + radius; ii++){
      if(ii>=1 && ii<=N && jj>=1 && jj<=N){
        const idx = IX(ii,jj);
        const d = 1 - Math.hypot(ii - i, jj - j) / (radius+0.5);
        if(d>0){
          dyeR[idx] += amountR * d;
          dyeG[idx] += amountG * d;
          dyeB[idx] += amountB * d;
        }
      }
    }
  }
}

function addVelocity(xw,yw, velx, vely){
  const i = Math.floor((xw / canvasW) * N) + 1;
  const j = Math.floor((yw / canvasH) * N) + 1;
  const radius = 1; // smaller influence
  for(let jj = j - radius; jj <= j + radius; jj++){
    for(let ii = i - radius; ii <= i + radius; ii++){
      if(ii>=1 && ii<=N && jj>=1 && jj<=N){
        const idx = IX(ii,jj);
        u[idx] += velx * 0.04;
        v[idx] += vely * 0.04;
      }
    }
  }
}

/* ============================
   Rendering to canvas (with glow)
   ============================ */
const tmpCanvas = document.createElement('canvas');
tmpCanvas.width = N; tmpCanvas.height = N;
const tmpCtx = tmpCanvas.getContext('2d');
const imageData = tmpCtx.createImageData(N, N);

function renderToCanvas(){
  // write dye arrays into imageData (tone-mapping)
  for(let j=1;j<=N;j++){
    for(let i=1;i<=N;i++){
      const idx = IX(i,j);
      const outIdx = ((j-1)*N + (i-1)) * 4;
      const r = Math.min(255, Math.pow(Math.max(0, dyeR[idx]), 0.6) * 255);
      const g = Math.min(255, Math.pow(Math.max(0, dyeG[idx]), 0.6) * 255);
      const b = Math.min(255, Math.pow(Math.max(0, dyeB[idx]), 0.6) * 255);
      imageData.data[outIdx] = r;
      imageData.data[outIdx+1] = g;
      imageData.data[outIdx+2] = b;
      imageData.data[outIdx+3] = Math.max(r,g,b);
    }
  }
  tmpCtx.putImageData(imageData, 0, 0);

  // clear and draw bloom passes (smaller blur than before)
  ctx.clearRect(0,0,canvasW,canvasH);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.95;
  ctx.filter = 'blur(14px) saturate(150%) contrast(105%)';
  ctx.drawImage(tmpCanvas, 0, 0, canvasW, canvasH);
  ctx.filter = 'blur(7px) saturate(140%)';
  ctx.globalAlpha = 0.6;
  ctx.drawImage(tmpCanvas, 0, 0, canvasW, canvasH);
  ctx.filter = 'none';
  ctx.globalAlpha = 0.8;
  ctx.drawImage(tmpCanvas, 0, 0, canvasW, canvasH);
  ctx.restore();

  // subtle vignette
  ctx.globalCompositeOperation = 'source-over';
  const g = ctx.createRadialGradient(canvasW/2, canvasH/2, Math.max(canvasW,canvasH)*0.15, canvasW/2, canvasH/2, Math.max(canvasW,canvasH)*0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvasW,canvasH);
}

/* ============================
   Mouse draw (pointer anywhere) — improved
   ============================ */
let isDrawing = false, lastX = 0, lastY = 0;
const palette = [
  [155,227,255],[122,192,255],[107,108,255],[229,108,255],[255,138,0],
  [125,255,0],[59,130,246],[255,119,177],[255,255,255],[0,214,122]
];

window.addEventListener('pointerdown', (e) => {
  if(e.button && e.button !== 0) return;
  isDrawing = true;
  lastX = e.clientX; lastY = e.clientY;
  const c = palette[Math.floor(Math.random()*palette.length)];
  // smaller initial splash
  addDensity(lastX, lastY, c[0]*0.018, c[1]*0.018, c[2]*0.018);
});

window.addEventListener('pointerup', () => { isDrawing = false; });

window.addEventListener('pointermove', (e) => {
  if(!isDrawing) return;
  const x = e.clientX, y = e.clientY;
  const dx = x - lastX, dy = y - lastY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.min(20, Math.max(1, Math.floor(dist / 6)));
  for(let s=0; s<=steps; s++){
    const t = s/steps;
    const ix = lastX + dx * t;
    const iy = lastY + dy * t;
    const color = palette[(Math.abs(Math.floor(ix+iy)) % palette.length)];
    // smaller dye & velocity for more local strokes
    addDensity(ix, iy, color[0]*0.016, color[1]*0.016, color[2]*0.016);
    addVelocity(ix, iy, dx * 0.45, dy * 0.45);
  }
  lastX = x; lastY = y;
});

/* ============================
   Floating letters (neon) + key bursts
   - each letter gets random neon gradient for uniqueness
   ============================ */

function pickNeonPair(){
  // returns two hex colors for gradient
  const pairs = [
    ['#9be3ff','#e56cff'],
    ['#7ac0ff','#8f7bff'],
    ['#ff9ad1','#7ac0ff'],
    ['#ffb86b','#ff6b6b'],
    ['#b9ff6c','#7af0ff'],
    ['#ffd36b','#ff77b1']
  ];
  return pairs[Math.floor(Math.random()*pairs.length)];
}

function spawnFloatingLetter(char){
  if(!char) return null;
  // space: we choose to not show visible floating for spaces
  if(char === ' ') return null;
  const span = document.createElement('span');
  span.className = 'floating-letter';
  span.textContent = char;
  const padding = 40;
  const left = Math.max(padding, Math.random() * (window.innerWidth - padding * 2));
  const baseline = window.innerHeight - 140;
  const top = Math.max(80, baseline + (Math.random() * 40 - 20));
  span.style.left = `${left}px`; span.style.top = `${top}px`;
  const rot = (Math.random() * 40 - 20).toFixed(1) + 'deg';
  span.style.setProperty('--rot', rot);
  const scale = 0.94 + Math.random()*0.4;
  span.style.transform = `translateY(0) scale(${scale}) rotate(${rot})`;
  // give each letter a neon gradient background
  const pair = pickNeonPair();
  span.style.background = `linear-gradient(90deg, ${pair[0]}, ${pair[1]})`;
  document.body.appendChild(span);
  setTimeout(()=>span.remove(), 1400);
  return {x: left + (span.offsetWidth/2 || 10), y: top + (span.offsetHeight/2 || 10)};
}

function spawnColorBurst(x,y, strength=1.0){
  // more local, fewer injections, smaller amounts
  const c = palette[Math.floor(Math.random()*palette.length)];
  const s = Math.max(0.5, Math.min(1.6, strength));
  const injections = 3; // fewer injections to avoid big blotches
  for(let i=0;i<injections;i++){
    const ox = x + (Math.random()*20 - 10);
    const oy = y + (Math.random()*14 - 7);
    addDensity(ox, oy, c[0]*0.04*s, c[1]*0.04*s, c[2]*0.01*s);
    addVelocity(ox, oy, (Math.random()*2-1)*4*s, (Math.random()*2-1)*4*s);
  }
}

/* small center burst on any keydown (very subtle) */
window.addEventListener('keydown', (e) => {
  if(e.key.length === 1){
    spawnColorBurst(canvasW/2 + (Math.random()*120-60), canvasH/2 + (Math.random()*80-40), 0.35);
  }
});

/* ============================
   Simulation loop
   ============================ */
let lastTime = performance.now();
function step(){
  const now = performance.now();
  let frameDt = (now - lastTime) / 1000;
  lastTime = now;
  if(frameDt <= 0) frameDt = 1/60;
  const steps = Math.max(1, Math.floor(frameDt / (1/30)));
  for(let s=0; s<steps; s++){
    vel_step(u, v, u_prev, v_prev, viscosity);
    dens_step(dyeR, dyeG, dyeB, dyeR_prev, dyeG_prev, dyeB_prev, diffusion);
  }
  renderToCanvas();
  requestAnimationFrame(step);
}
step();

/* ============================
   Typing game integration
   ============================ */
function formatTime(ms){ return (ms/1000).toFixed(2); }
function updateStats(){
  if(!startTime) return;
  const elapsed = Date.now() - startTime;
  timerDisplay.textContent = formatTime(elapsed);
  const minutes = elapsed / 60000;
  const wpm = minutes > 0 ? Math.round((correctChars / 5) / minutes) : 0;
  wpmDisplay.textContent = wpm;
  const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 0;
  accDisplay.textContent = accuracy + '%';
  const trackWidth = document.getElementById('track-container').offsetWidth - 60;
  carPosition = Math.min((typedChars / totalChars) * trackWidth, trackWidth || 0);
  const car = document.querySelector('.player-car');
  if(car) car.style.transform = `translate(${carPosition}px, -50%)`;
}
function commitResult(){
  clearInterval(timerInterval);
  finalWPM.textContent = wpmDisplay.textContent;
  finalAcc.textContent = accDisplay.textContent;
  finalTime.textContent = timerDisplay.textContent;
  overlay.classList.add('show');
}
function resetGame(newText=false){
  clearInterval(timerInterval);
  inputField.value = '';
  inputField.disabled = false; inputField.focus();
  textDisplay.innerHTML = '';
  typedChars = correctChars = totalChars = 0; carPosition = 0; prevInputValue='';
  if(newText || !currentText){ const list = textBank[currentDifficulty]; currentText = list[Math.floor(Math.random()*list.length)]; }
  totalChars = currentText.length;
  currentText.split('').forEach((char, idx) => {
    const span = document.createElement('span'); span.textContent = char; span.className='untyped';
    if(idx===0) span.classList.add('current'); textDisplay.appendChild(span);
  });
  wpmDisplay.textContent='0'; accDisplay.textContent='0%'; timerDisplay.textContent='0.00';
  const car = document.querySelector('.player-car'); if(car) car.style.transform = `translate(0px, -50%)`;
}
function startGame(){ inputField.disabled=false; inputField.focus(); startTime = Date.now(); timerInterval = setInterval(updateStats,100); }

function handleInput(e){
  const val = inputField.value;
  if(val.length > prevInputValue.length){
    const newChar = val[val.length-1];
    const pos = spawnFloatingLetter(newChar);
    if(pos) spawnColorBurst(pos.x + (Math.random()*24-12), pos.y + (Math.random()*16-8), 1.0);
    else spawnColorBurst(Math.random()*canvasW, Math.random()*canvasH, 0.6);
  }
  prevInputValue = val;
  if(!startTime) startGame();
  if(val.length > totalChars) inputField.value = val.slice(0, totalChars);
  typedChars = inputField.value.length;
  const spans = textDisplay.querySelectorAll('span');
  let newCorrect = 0;
  spans.forEach((span, idx) => {
    const char = currentText[idx];
    const typedChar = inputField.value[idx];
    span.classList.remove('typed','wrong','current');
    if(idx < typedChars){
      if(typedChar === char){ span.classList.add('typed','correct'); newCorrect++; }
      else { span.classList.add('wrong'); }
    } else if(idx === typedChars) { span.classList.add('current'); }
    else { span.classList.add('untyped'); }
  });
  correctChars = newCorrect;
  if(typedChars === totalChars) commitResult();
}

/* ============================
   events & init
   ============================ */
inputField.addEventListener('input', handleInput);
restartBtn.addEventListener('click', ()=>{ overlay.classList.remove('show'); resetGame(); });
diffButtons.forEach(btn => btn.addEventListener('click', ()=>{ diffButtons.forEach(b=>b.classList.remove('selected')); btn.classList.add('selected'); currentDifficulty = btn.dataset.diff; resetGame(true); }));

window.addEventListener('load', ()=>{ diffButtons[0].classList.add('selected'); currentText = textBank[currentDifficulty][0]; resetGame(); inputField.disabled=false; inputField.focus(); window.addEventListener('resize', ()=>{ document.querySelectorAll('.floating-letter').forEach(el=>el.remove()); }); });
