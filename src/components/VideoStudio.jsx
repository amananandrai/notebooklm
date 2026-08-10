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
  const [showCaptions, setShowCaptions]       = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

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
    ctx.lineWidth = 14;
    ctx.strokeRect(15, 15, canvas.width - 30, canvas.height - 30);

    const slide = slideList[currentSlideIdx];
    if (!slide) {
      // Empty chalkboard state
      ctx.fillStyle = '#ffffffc0';
      ctx.font = 'bold 44px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NotebookLM 3D Studio', canvas.width / 2, canvas.height / 2 - 30);
      ctx.font = '26px "Inter", sans-serif';
      ctx.fillStyle = '#ffffff60';
      ctx.fillText('Ready to record podcast video', canvas.width / 2, canvas.height / 2 + 30);
      if (boardTextureRef.current) boardTextureRef.current.needsUpdate = true;
      return;
    }

    // Draw Slide contents
    ctx.fillStyle = '#e2f0d9'; // Chalk white/greenish
    ctx.textAlign = 'left';

    // Slide Header
    ctx.font = 'bold 36px "Inter", sans-serif';
    const title = slide.title.length > 45 ? slide.title.slice(0, 42) + '...' : slide.title;
    ctx.fillText(title, 60, 90);

    // Divider
    ctx.strokeStyle = '#e2f0d960';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(60, 120);
    ctx.lineTo(canvas.width - 60, 120);
    ctx.stroke();

    // Bullet points
    ctx.fillStyle = '#ffffffd0';
    ctx.font = '24px "Inter", sans-serif';
    let startY = 180;
    const bullets = slide.bullets || [];
    bullets.forEach((b, i) => {
      const text = b.length > 70 ? b.slice(0, 67) + '...' : b;
      ctx.fillText(`• ${text}`, 60, startY + i * 65);
    });

    // Page indicator
    ctx.fillStyle = '#e2f0d950';
    ctx.font = '18px "Inter", sans-serif';
    ctx.fillText(`Slide ${currentSlideIdx + 1} of ${slideList.length}`, 60, canvas.height - 55);

    // Dynamic burned-in subtitles at the bottom of blackboard if playing
    if (showCaptions && playing && current >= 0) {
      const turn = turns[current];
      if (turn) {
        const speakerName = turn.speaker?.split(' ')[0] || 'Host';
        const speakerColor = turn.speaker?.toLowerCase().includes('alex') ? '#a594f2' : '#f9a8d4';
        
        // Draw subtitle background plate
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(40, canvas.height - 130, canvas.width - 80, 100);
        ctx.strokeStyle = speakerColor + '40';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, canvas.height - 130, canvas.width - 80, 100);

        // Draw speaker name pill
        ctx.fillStyle = speakerColor;
        ctx.font = 'bold 22px "Inter", sans-serif';
        ctx.fillText(speakerName, 60, canvas.height - 75);

        // Draw spoken text (wrapped to fit)
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 19px "Inter", sans-serif';
        
        const maxTextWidth = canvas.width - 240;
        const words = turn.text.split(' ');
        let line = '';
        const lines = [];
        
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxTextWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
          } else {
            line = testLine;
          }
        }
        lines.push(line);
        
        lines.slice(0, 3).forEach((l, li) => {
          ctx.fillText(l.trim(), 170, canvas.height - 90 + li * 28);
        });
      }
    }

    if (boardTextureRef.current) {
      boardTextureRef.current.needsUpdate = true;
    }
  }, [currentSlideIdx, current, playing, showCaptions, turns, slideList]);

  // Redraw chalkboard when slide or speaker changes
  useEffect(() => {
    updateBlackboardTexture();
  }, [currentSlideIdx, current, playing, showCaptions, updateBlackboardTexture]);

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

  const startRecording = useCallback(async () => {
    if (!rendererRef.current) return;
    recordedChunksRef.current = [];

    const canvas = rendererRef.current.domElement;
    const canvasStream = canvas.captureStream(30);

    let audioStream = null;
    try {
      // Prompt user for microphone access to record spoken dialogue/speakers
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.warn("Microphone access denied or unavailable. Recording video without audio.", err);
    }

    const tracks = [...canvasStream.getVideoTracks()];
    if (audioStream) {
      tracks.push(...audioStream.getAudioTracks());
    }
    const combinedStream = new MediaStream(tracks);

    let options = { mimeType: 'video/webm;codecs=vp9' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options = { mimeType: 'video/webm' };
    }

    try {
      const recorder = new MediaRecorder(combinedStream, options);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `presentation_3d_recording.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };

      recorder.start();
      setIsRecording(true);

      // Autoplay speech synthesis
      if (!synthRef.current.speaking) {
        synthRef.current.cancel();
        setElapsed(0);
        setPlaying(true);
        setPaused(false);
        turnIdxRef.current = 0;
        speakTurn(0);
      }
    } catch (err) {
      console.error('Error starting video capture:', err);
    }
  }, [playing, speakTurn]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      // Stop all tracks (including microphone) to turn off recording light
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    setIsRecording(false);
  }, []);

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
    createMic(-1.25, 0.7, -Math.PI / 5);
    createMic(1.25, 0.7, Math.PI / 5);

    // 4. Blackboard (Slide display)
    const boardCanvas = canvasRef.current;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTextureRef.current = boardTexture;

    const boardGeo = new THREE.BoxGeometry(4.8, 2.7, 0.08);
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.95 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 1.8, -1.8);
    board.receiveShadow = true;
    scene.add(board);

    // Wooden frame for board
    const frameGeo = new THREE.BoxGeometry(4.92, 2.82, 0.06);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3d2511', roughness: 0.8 });
    const boardFrame = new THREE.Mesh(frameGeo, frameMat);
    boardFrame.position.set(0, 1.8, -1.82);
    scene.add(boardFrame);

    // 5. High-Resolution 3D Host Avatars (Procedural Geometries)
    function createAvatar(isHostA, colorHex, x, z, rotY) {
      const avatar = new THREE.Group();
      avatar.position.set(x, 0.1, z);
      avatar.rotation.y = rotY;

      // Table Mount Base & Stand (Metallic)
      const postMat = new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.15, metalness: 0.95 });
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 12), postMat);
      post.position.y = 0.225;
      avatar.add(post);

      const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), postMat);
      baseRing.position.y = 0.01;
      avatar.add(baseRing);

      // --- Body (Torso / Suit / Shirt Collar) ---
      const suitMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
      const torso = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 24), suitMat);
      torso.position.y = 0.55;
      torso.scale.set(1.1, 1, 0.75); // widen shoulders, flatten depth
      torso.castShadow = true;
      avatar.add(torso);

      // Shirt Collar (White)
      const collarMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 });
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.078, 0.08, 16), collarMat);
      collar.position.y = 0.93;
      avatar.add(collar);

      // Neck (Skin tone)
      const skinMat = new THREE.MeshStandardMaterial({ color: '#ffd1b3', roughness: 0.7 });
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 16), skinMat);
      neck.position.y = 0.98;
      avatar.add(neck);

      // --- Head & Face Features (High Subdivision) ---
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.16; // Head center height

      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 32), skinMat);
      skull.castShadow = true;
      headGroup.add(skull);

      // Nose
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.065, 12), skinMat);
      nose.position.set(0, -0.01, 0.175);
      nose.rotation.x = -Math.PI / 2.05;
      headGroup.add(nose);

      // Eyes (Detailed sclera, iris, pupil)
      function makeEye(sideOffset) {
        const eyeGroup = new THREE.Group();
        eyeGroup.position.set(sideOffset, 0.035, 0.155);

        // Sclera (White background)
        const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 16), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
        sclera.scale.set(1, 1, 0.5);
        eyeGroup.add(sclera);

        // Iris (Host A: blue-violet; Host B: emerald green)
        const irisColor = isHostA ? '#3b82f6' : '#10b981';
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), new THREE.MeshBasicMaterial({ color: irisColor }));
        iris.position.z = 0.012;
        eyeGroup.add(iris);

        // Pupil (Black)
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: '#000000' }));
        pupil.position.z = 0.018;
        eyeGroup.add(pupil);

        return eyeGroup;
      }
      headGroup.add(makeEye(-0.05));
      headGroup.add(makeEye(0.05));

      // Eyebrows
      const browMat = new THREE.MeshBasicMaterial({ color: isHostA ? '#2b1a0a' : '#4a2508' });
      const browL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.009, 0.005), browMat);
      browL.position.set(-0.05, 0.075, 0.17);
      browL.rotation.z = 0.06;
      headGroup.add(browL);

      const browR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.009, 0.005), browMat);
      browR.position.set(0.05, 0.075, 0.17);
      browR.rotation.z = -0.06;
      headGroup.add(browR);

      // --- Physical Speaking Lips ---
      const lipMat = new THREE.MeshStandardMaterial({ color: '#d17272', roughness: 0.85 });
      const lipTop = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.065, 8), lipMat);
      lipTop.position.set(0, -0.062, 0.165);
      lipTop.rotation.z = Math.PI / 2;
      headGroup.add(lipTop);

      const lipBottom = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.065, 8), lipMat);
      lipBottom.position.set(0, -0.075, 0.165);
      lipBottom.rotation.z = Math.PI / 2;
      headGroup.add(lipBottom);

      // --- Professional Studio Headset (Band + Cups) ---
      const gearMat = new THREE.MeshStandardMaterial({ color: '#141416', roughness: 0.45, metalness: 0.85 });
      // Headband arching over skull
      const band = new THREE.Mesh(
        new THREE.TorusGeometry(0.198, 0.015, 8, 24, Math.PI),
        gearMat
      );
      band.position.y = 0.03;
      band.rotation.z = Math.PI;
      headGroup.add(band);

      // Cushioned Earcups (Left & Right)
      const cupL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 16), gearMat);
      cupL.position.set(-0.19, 0.015, 0);
      cupL.rotation.z = Math.PI / 2;
      headGroup.add(cupL);

      const cupR = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 16), gearMat);
      cupR.position.set(0.19, 0.015, 0);
      cupR.rotation.z = -Math.PI / 2;
      headGroup.add(cupR);

      // --- Hair Styles (Procedural 3D Elements) ---
      const hairMat = new THREE.MeshStandardMaterial({ color: isHostA ? '#2d1b10' : '#542e0c', roughness: 0.95 });
      const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.185, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), hairMat);
      hairCap.position.set(0, 0.02, -0.01);
      hairCap.rotation.x = -0.15;
      headGroup.add(hairCap);

      if (isHostA) {
        // Front bangs tuft (Alex style)
        const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), hairMat);
        tuft.position.set(0.035, 0.12, 0.12);
        headGroup.add(tuft);
      } else {
        // Detailed flowing ponytail behind (Jordan style)
        const ponyJoint = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), new THREE.MeshBasicMaterial({ color: '#f3a8d4' }));
        ponyJoint.position.set(0, -0.1, -0.16);
        headGroup.add(ponyJoint);

        const ponytail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.28, 8), hairMat);
        ponytail.position.set(0, -0.22, -0.18);
        ponytail.rotation.x = 0.18;
        headGroup.add(ponytail);
      }

      avatar.add(headGroup);

      // Back-light Neon Halo Ring (representing audio cast highlights)
      const ringGeo = new THREE.RingGeometry(0.48, 0.50, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 0.95, -0.18); // set behind character torso
      avatar.add(ring);

      avatar.userData = { headGroup, lipBottom, ring, basePosition: 0.1 };
      
      scene.add(avatar);
      return avatar;
    }

    hostARef.current = createAvatar(true, '#7c6cf6', -1.35, 0.65, Math.PI / 4);
    hostBRef.current = createAvatar(false, '#ec4899', 1.35, 0.65, -Math.PI / 4);

    // Initial chalkboard render
    updateBlackboardTexture();

    // ── Animation Frame Loop ─────────────────────────────────────
    let clock = new THREE.Clock();

    function animate() {
      animationFrameRef.current = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Subtle breathing animations for both hosts
      if (hostARef.current && hostBRef.current) {
        hostARef.current.position.y = hostARef.current.userData.basePosition + Math.sin(time * 1.5) * 0.008;
        hostBRef.current.position.y = hostBRef.current.userData.basePosition + Math.sin(time * 1.6 + 0.5) * 0.008;

        hostARef.current.rotation.z = 0;
        hostBRef.current.rotation.z = 0;

        // Reset speaking lip and ring scale if quiet
        hostARef.current.userData.lipBottom.position.y = -0.075;
        hostBRef.current.userData.lipBottom.position.y = -0.075;

        const turn = (playing && !paused && current >= 0) ? turns[current] : null;
        const isASpeaking = turn?.speaker?.toLowerCase().includes('host a') || turn?.speaker?.toLowerCase().includes('alex');
        
        if (!isASpeaking && hostARef.current.userData.ring) {
          hostARef.current.userData.ring.scale.set(1, 1, 1);
        }
        if ((!playing || paused || current < 0 || isASpeaking) && hostBRef.current.userData.ring) {
          hostBRef.current.userData.ring.scale.set(1, 1, 1);
        }
      }

      // Speak animations (if playing and speaking)
      if (playing && !paused && current >= 0 && turns[current]) {
        const turn = turns[current];
        const isA  = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
        const activeHost = isA ? hostARef.current : hostBRef.current;

        if (activeHost && activeHost.userData.ring) {
          // Bob the panel up and down slightly to simulate talking
          activeHost.position.y = activeHost.userData.basePosition + Math.abs(Math.sin(time * 6)) * 0.035;
          activeHost.rotation.z = Math.sin(time * 4) * 0.015;

          // Physically translate bottom lip down to open mouth
          const lipDelta = Math.abs(Math.sin(time * 16)) * 0.024;
          activeHost.userData.lipBottom.position.y = -0.075 - lipDelta;

          // Pulse the back neon halo border ring scale
          const ringPulse = 1.0 + Math.abs(Math.sin(time * 14)) * 0.16;
          activeHost.userData.ring.scale.set(ringPulse, ringPulse, 1);
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
        width={1024}
        height={512}
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
      >
        {isRecording && (
          <div style={{
            position: 'absolute', top: 16, right: 16,
            background: 'rgba(0,0,0,0.65)', border: '1px solid var(--red)',
            borderRadius: 99, padding: '6px 14px', fontSize: 11, fontWeight: 700,
            color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 6,
            zIndex: 10, animation: 'loadPulse 1.5s infinite'
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
            REC VISUALS
          </div>
        )}
        {showCaptions && playing && current >= 0 && turns[current] && (
          <div style={{
            position: 'absolute', bottom: 20, left: '50%',
            transform: 'translateX(-50%)', width: '85%', maxWidth: '640px',
            background: 'rgba(10, 10, 15, 0.85)', backdropFilter: 'blur(8px)',
            border: `1px solid ${turns[current]?.speaker?.toLowerCase().includes('alex') ? 'rgba(124, 108, 246, 0.4)' : 'rgba(236, 72, 153, 0.4)'}`,
            borderRadius: 12, padding: '10px 18px', display: 'flex',
            alignItems: 'center', gap: 12, zIndex: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
          }}>
            <span style={{
              background: turns[current]?.speaker?.toLowerCase().includes('alex') ? '#7c6cf6' : '#ec4899',
              color: 'white', fontSize: 10, fontWeight: 800, padding: '3px 8px',
              borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0
            }}>
              {turns[current]?.speaker?.split(' ')[0]}
            </span>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-primary)', textAlign: 'left', fontStyle: 'italic', lineHeight: 1.4 }}>
              "{turns[current]?.text}"
            </p>
          </div>
        )}
      </div>

      {/* Video Studio Controls */}
      <div className="audio-controls" style={{ background: 'var(--bg-elevated)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="audio-btn play-btn" onClick={handlePlayPause}>
            {playing && !paused ? '⏸' : '▶'}
          </button>
          <button className="audio-btn" onClick={handleStop}>⏹</button>
          <span className="audio-time" style={{ marginLeft: 8 }}>{fmtTime(elapsed)}</span>
          
          <button
            onClick={isRecording ? stopRecording : startRecording}
            style={{
              marginLeft: 12,
              background: isRecording ? 'var(--red)' : 'var(--bg-active)',
              color: isRecording ? 'white' : 'var(--text-primary)',
              border: '1px solid',
              borderColor: isRecording ? 'var(--red)' : 'var(--border-hi)',
              fontSize: 12,
              padding: '6px 14px',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>{isRecording ? '⏹ Stop Recording' : '🎥 Record Visuals'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Subtitles CC Toggle */}
          <button
            onClick={() => setShowCaptions(!showCaptions)}
            style={{
              background: showCaptions ? 'var(--accent-dim)' : 'var(--bg-active)',
              color: showCaptions ? 'var(--accent-lit)' : 'var(--text-secondary)',
              border: '1px solid',
              borderColor: showCaptions ? 'var(--accent)' : 'var(--border-hi)',
              fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 6,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
            }}
          >
            💬 CC: {showCaptions ? 'ON' : 'OFF'}
          </button>
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
