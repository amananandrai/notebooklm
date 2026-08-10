import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';

export default function VideoStudio({ slides = [], script = [] }) {
  const mountRef = useRef(null);
  const canvasRef = useRef(null); // hidden 2D canvas for drawing blackboard text

  const [current, setCurrent]   = useState(-1); // current turn index (-1 = idle)
  const [playing, setPlaying]   = useState(false);
  const [paused, setPaused]     = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);

  const synthRef = useRef(window.speechSynthesis);
  const timerRef = useRef(null);
  const turnIdxRef = useRef(0);

  // References to Three.js objects we need to animate
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const hostARef = useRef(null); // Host A mesh group
  const hostBRef = useRef(null); // Host B mesh group
  const boardTextureRef = useRef(null); // canvas texture for chalkboard
  const animationFrameRef = useRef(null);

  const turns = Array.isArray(script) ? script : [];
  const slideList = Array.isArray(slides) ? slides : [];

  // Speech voices
  const [voices, setVoices] = useState([]);
  const [voiceA, setVoiceA] = useState(null);
  const [voiceB, setVoiceB] = useState(null);

  // ── Auto-advance slide based on conversation turn ────────────
  useEffect(() => {
    if (current < 0 || !slideList.length) return;
    // Map script turns to slide indices linearly
    // e.g. if we have 8 turns and 4 slides, each slide handles ~2 turns.
    const turnsPerSlide = Math.max(1, Math.ceil(turns.length / slideList.length));
    const nextSlideIdx = Math.min(slideList.length - 1, Math.floor(current / turnsPerSlide));
    setCurrentSlideIdx(nextSlideIdx);
  }, [current, slideList, turns]);

  // ── Draw slide onto hidden 2D canvas ──────────────────────────
  const updateBlackboardTexture = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Fill chalkboard dark green
    ctx.fillStyle = '#102a1b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Chalk border
    ctx.strokeStyle = '#ffffff20';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    const slide = slideList[currentSlideIdx];
    if (!slide) {
      // Empty chalkboard state
      ctx.fillStyle = '#ffffffc0';
      ctx.font = 'bold 28px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NotebookLM 3D Studio', canvas.width / 2, canvas.height / 2 - 20);
      ctx.font = '16px "Inter", sans-serif';
      ctx.fillStyle = '#ffffff60';
      ctx.fillText('Ready to record podcast video', canvas.width / 2, canvas.height / 2 + 20);
      if (boardTextureRef.current) boardTextureRef.current.needsUpdate = true;
      return;
    }

    // Draw Slide contents
    ctx.fillStyle = '#e2f0d9'; // Chalk white/greenish
    ctx.textAlign = 'left';

    // Slide Header
    ctx.font = 'bold 24px "Inter", sans-serif';
    const title = slide.title.length > 34 ? slide.title.slice(0, 32) + '...' : slide.title;
    ctx.fillText(title, 40, 60);

    // Divider
    ctx.strokeStyle = '#e2f0d960';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 80);
    ctx.lineTo(canvas.width - 40, 80);
    ctx.stroke();

    // Bullet points
    ctx.fillStyle = '#ffffffd0';
    ctx.font = '15px "Inter", sans-serif';
    let startY = 120;
    const bullets = slide.bullets || [];
    bullets.forEach((b, i) => {
      const text = b.length > 55 ? b.slice(0, 52) + '...' : b;
      ctx.fillText(`• ${text}`, 40, startY + i * 40);
    });

    // Page indicator
    ctx.fillStyle = '#e2f0d950';
    ctx.font = '11px "Inter", sans-serif';
    ctx.fillText(`Slide ${currentSlideIdx + 1} of ${slideList.length}`, 40, canvas.height - 35);

    if (boardTextureRef.current) {
      boardTextureRef.current.needsUpdate = true;
    }
  }, [currentSlideIdx, slideList]);

  // Redraw chalkboard when slide changes
  useEffect(() => {
    updateBlackboardTexture();
  }, [currentSlideIdx, updateBlackboardTexture]);

  // ── Load speech voices ────────────────────────────────────────
  useEffect(() => {
    function loadVoices() {
      const v = synthRef.current.getVoices();
      if (!v.length) return;
      setVoices(v);
      const en = v.filter(v => v.lang.startsWith('en'));
      setVoiceA(en.find(v => v.name.toLowerCase().includes('male') || v.name.includes('David') || v.name.includes('Google US English')) || en[0]);
      setVoiceB(en.find(v => v.name.toLowerCase().includes('female') || v.name.includes('Zira') || v.name.includes('Samantha') || v.name.includes('Google UK English Female')) || en[1] || en[0]);
    }
    loadVoices();
    synthRef.current.addEventListener('voiceschanged', loadVoices);
    return () => synthRef.current.removeEventListener?.('voiceschanged', loadVoices);
  }, []);

  // ── Timer Effect ──────────────────────────────────────────────
  useEffect(() => {
    if (playing && !paused) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [playing, paused]);

  // Cleanup speech
  useEffect(() => () => { synthRef.current.cancel(); clearInterval(timerRef.current); }, []);

  // ── Speech synthesis player ────────────────────────────────────
  const speakTurn = useCallback((idx) => {
    if (idx >= turns.length) {
      setPlaying(false);
      setPaused(false);
      setCurrent(-1);
      clearInterval(timerRef.current);
      return;
    }

    const turn = turns[idx];
    const isA  = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');

    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.voice = isA ? voiceA : voiceB;
    utter.rate  = 0.94;
    utter.pitch = isA ? 0.98 : 1.08;

    utter.onstart = () => {
      setCurrent(idx);
      turnIdxRef.current = idx;
    };

    utter.onend = () => {
      setTimeout(() => {
        if (turnIdxRef.current === idx) {
          speakTurn(idx + 1);
        }
      }, 500);
    };

    utter.onerror = () => {
      setPlaying(false);
    };

    synthRef.current.speak(utter);
  }, [turns, voiceA, voiceB]);

  function handlePlayPause() {
    if (!turns.length) return;
    if (!playing) {
      synthRef.current.cancel();
      setElapsed(0);
      setPlaying(true);
      setPaused(false);
      turnIdxRef.current = 0;
      speakTurn(0);
    } else if (paused) {
      synthRef.current.resume();
      setPaused(false);
    } else {
      synthRef.current.pause();
      setPaused(true);
    }
  }

  function handleStop() {
    synthRef.current.cancel();
    setPlaying(false);
    setPaused(false);
    setCurrent(-1);
    setElapsed(0);
    clearInterval(timerRef.current);
  }

  // ── Three.js Scene Setup ──────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 760;
    const height = 420;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0a0a0f'); // match app bg
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 3, 7.5);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambientLight);

    // Warm overhead spotlight
    const spotlight = new THREE.SpotLight(0xfffaed, 2.5);
    spotlight.position.set(0, 8, 3);
    spotlight.angle = Math.PI / 4;
    spotlight.penumbra = 0.8;
    spotlight.castShadow = true;
    scene.add(spotlight);

    // Soft blue fill light
    const fillLight = new THREE.DirectionalLight(0x7c6cf6, 0.7);
    fillLight.position.set(-4, 3, 2);
    scene.add(fillLight);

    // 3. Studio Furniture
    // Wooden Table
    const tableGeo = new THREE.CylinderGeometry(2, 2.2, 0.15, 32);
    const tableMat = new THREE.MeshStandardMaterial({ color: '#2a1a0a', roughness: 0.45, metalness: 0.1 });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -0.075;
    table.receiveShadow = true;
    scene.add(table);

    const standGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8);
    const standMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.7 });
    const tableStand = new THREE.Mesh(standGeo, standMat);
    tableStand.position.y = -0.75;
    scene.add(tableStand);

    // Microphones
    function createMic(x, z, rotY) {
      const group = new THREE.Group();
      group.position.set(x, 0.1, z);
      group.rotation.y = rotY;

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16), standMat);
      group.add(base);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 8), standMat);
      shaft.position.y = 0.2;
      group.add(shaft);

      const grill = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: '#777777', roughness: 0.3 }));
      grill.position.y = 0.42;
      group.add(grill);

      scene.add(group);
    }
    createMic(-0.6, 0.8, -Math.PI / 6);
    createMic(0.6, 0.8, Math.PI / 6);

    // 4. Blackboard (Slide display)
    const boardCanvas = canvasRef.current;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTextureRef.current = boardTexture;

    const boardGeo = new THREE.BoxGeometry(3.6, 2, 0.08);
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.95 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 1.6, -1.8);
    board.receiveShadow = true;
    scene.add(board);

    // Wooden frame for board
    const frameGeo = new THREE.BoxGeometry(3.72, 2.12, 0.06);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3d2511', roughness: 0.8 });
    const boardFrame = new THREE.Mesh(frameGeo, frameMat);
    boardFrame.position.set(0, 1.6, -1.82);
    scene.add(boardFrame);

    // 5. Stylized Avatars (Head/Body/Mouth spheres)
    function createAvatar(colorHex, x, z, rotY) {
      const avatar = new THREE.Group();
      avatar.position.set(x, 0.1, z);
      avatar.rotation.y = rotY;

      // Stylized cylinder body (torso)
      const bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.32, 0.9, 16), bodyMat);
      body.position.y = 0.45;
      body.castShadow = true;
      avatar.add(body);

      // Neck
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 8), new THREE.MeshStandardMaterial({ color: '#ffd1b3' }));
      neck.position.y = 0.95;
      avatar.add(neck);

      // Sphere Head
      const headMat = new THREE.MeshStandardMaterial({ color: '#ffd1b3', roughness: 0.8 });
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), headMat);
      head.position.y = 1.15;
      head.castShadow = true;
      avatar.add(head);

      // Eyeglasses/Accessories (Host A)
      if (colorHex === '#7c6cf6') {
        const glasses = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.04), new THREE.MeshStandardMaterial({ color: '#111' }));
        glasses.position.set(0, 1.18, 0.18);
        avatar.add(glasses);
      } else {
        // Hair cap (Host B)
        const hair = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#3a2010', roughness: 0.9 }));
        hair.position.set(0, 1.18, 0.02);
        hair.rotation.x = -0.15;
        avatar.add(hair);
      }

      // Mouth sphere (we will pulse this to animate speaking)
      const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshStandardMaterial({ color: '#400a0a' }));
      mouth.position.set(0, 1.08, 0.19);
      avatar.add(mouth);
      avatar.userData = { mouth, baseScale: 1, speakTimer: 0 };

      scene.add(avatar);
      return avatar;
    }

    hostARef.current = createAvatar('#7c6cf6', -0.85, 0.7, Math.PI / 4.5);
    hostBRef.current = createAvatar('#ec4899', 0.85, 0.7, -Math.PI / 4.5);

    // Initial chalkboard render
    updateBlackboardTexture();

    // ── Animation Frame Loop ─────────────────────────────────────
    let clock = new THREE.Clock();

    function animate() {
      animationFrameRef.current = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Subtle breathing animations for both hosts
      if (hostARef.current && hostBRef.current) {
        hostARef.current.position.y = 0.1 + Math.sin(time * 1.5) * 0.012;
        hostBRef.current.position.y = 0.1 + Math.sin(time * 1.6 + 0.5) * 0.012;

        // Reset mouth sizes
        hostARef.current.userData.mouth.scale.set(1, 1, 1);
        hostBRef.current.userData.mouth.scale.set(1, 1, 1);
        hostARef.current.rotation.x = 0;
        hostBRef.current.rotation.x = 0;
      }

      // Speak animations (if playing and speaking)
      if (playing && !paused && current >= 0 && turns[current]) {
        const turn = turns[current];
        const isA  = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
        const activeHost = isA ? hostARef.current : hostBRef.current;

        if (activeHost) {
          // Bob head/body slightly
          activeHost.position.y += Math.abs(Math.sin(time * 8)) * 0.025;
          activeHost.rotation.x = Math.sin(time * 10) * 0.035;

          // Pulse mouth open/close to simulate speaking
          const mouthScale = 1 + Math.abs(Math.sin(time * 18)) * 2.8;
          activeHost.userData.mouth.scale.set(1.5, mouthScale, 1.2);
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    // ── Resize handler ───────────────────────────────────────────
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, height);
    };
    window.addEventListener('resize', handleResize);

    // Cleanup Three.js setup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      if (rendererRef.current && rendererRef.current.domElement) {
        rendererRef.current.domElement.remove();
      }
    };
  }, [playing, paused, current, turns, updateBlackboardTexture]);

  function fmtTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-base)' }}>
      
      {/* Hidden 2D Canvas used for drawing blackboard texture */}
      <canvas
        ref={canvasRef}
        width={512}
        height={256}
        style={{ display: 'none' }}
      />

      {/* 3D WebGL Canvas Holder */}
      <div
        ref={mountRef}
        style={{
          width: '100%', height: '420px', position: 'relative',
          overflow: 'hidden', borderBottom: '1px solid var(--border)',
          boxShadow: 'inset 0 4px 20px #0008',
        }}
      />

      {/* Video Studio Controls */}
      <div className="audio-controls" style={{ background: 'var(--bg-elevated)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="audio-btn play-btn" onClick={handlePlayPause}>
            {playing && !paused ? '⏸' : '▶'}
          </button>
          <button className="audio-btn" onClick={handleStop}>⏹</button>
          <span className="audio-time" style={{ marginLeft: 8 }}>{fmtTime(elapsed)}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Active slide badge */}
          {slideList.length > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-lit)', padding: '4px 10px', background: 'var(--accent-dim)', borderRadius: 99, border: '1px solid var(--accent)30' }}>
              📚 Blackboard: Slide {currentSlideIdx + 1}
            </span>
          )}
          {voices.length === 0 && (
            <span style={{ fontSize: 11, color: 'var(--yellow)' }}>⏳ Loading voice cast...</span>
          )}
          {playing && current >= 0 && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#f9a8d4', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              🎙 Speaking: {turns[current]?.speaker?.split(' ')[0]}
            </span>
          )}
        </div>
      </div>

      {/* Bottom script view & instructions */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, padding: 14, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
              🎬 WebGL 3D Video Studio
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              A live WebGL scene displaying Host A (Alex) and Host B (Jordan) in the recording studio.
              The chalkboard displays the slides in 3D, and the characters animate in sync with the audio.
            </div>
          </div>
        </div>

        {turns.map((turn, i) => (
          <div
            key={i}
            className={`audio-turn${i === current ? ' active' : ''}`}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 8, background: i === current ? 'var(--accent-dim)' : 'var(--bg-elevated)', transition: 'background 0.2s' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{turn.speaker}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{turn.timestamp}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{turn.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
