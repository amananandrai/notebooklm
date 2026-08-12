import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const EMPTY_LIST = [];
const API_BASE = window.location.origin.includes('5173') || window.location.origin.includes('localhost')
  ? 'http://127.0.0.1:8080/api'
  : '/api';

export default function VideoStudio({ slides, script }) {
  const mountRef = useRef(null);
  const canvasRef = useRef(null); // hidden 2D canvas for drawing blackboard text

  const [current, setCurrent]   = useState(-1); // current turn index (-1 = idle)
  const [playing, setPlaying]   = useState(false);
  const [paused, setPaused]     = useState(false);
  const [elapsed, setElapsed]   = useState(0);
  const [currentSlideIdx, setCurrentSlideIdx] = useState(0);
  const [showCaptions, setShowCaptions]       = useState(true);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const recordedVideoUrlRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingAudioRef = useRef(null);
  const recordingAudioUrlRef = useRef(null);
  const recordingAudioContextRef = useRef(null);
  const recordingDurationsRef = useRef([]);
  const [recordingError, setRecordingError] = useState('');

  const synthRef = useRef(window.speechSynthesis);
  const timerRef = useRef(null);
  const turnIdxRef = useRef(0);

  // References to Three.js objects we need to animate
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const hostARef = useRef(null); // Host A mesh group
  const hostBRef = useRef(null); // Host B mesh group
  const boardTextureRef = useRef(null); // canvas texture for chalkboard
  const updateBlackboardTextureRef = useRef(() => {});
  const captionCanvasRef = useRef(null);
  const captionTextureRef = useRef(null);
  const captionMeshRef = useRef(null);
  const updateCaptionOverlayRef = useRef(() => {});
  const animationFrameRef = useRef(null);
  const playbackRef = useRef({ playing: false, paused: false, current: -1, turns: [] });



  const turns = useMemo(() => Array.isArray(script) ? script : EMPTY_LIST, [script]);
  const slideList = useMemo(() => Array.isArray(slides) ? slides : EMPTY_LIST, [slides]);

  useEffect(() => {
    playbackRef.current = { playing, paused, current, turns };
  }, [playing, paused, current, turns]);

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

    const wrapText = (text, maxWidth) => {
      const words = String(text || '').split(/\s+/).filter(Boolean);
      const lines = [];
      let line = '';
      words.forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
          lines.push(line);
          line = word;
        } else {
          line = candidate;
        }
      });
      if (line) lines.push(line);
      return lines;
    };

    // Slide header: wrap instead of truncating long titles/subtitles.
    ctx.font = 'bold 28px "Inter", sans-serif';
    let headerY = 68;
    wrapText(slide.title, canvas.width - 120).forEach((line) => {
      ctx.fillText(line, 60, headerY);
      headerY += 34;
    });
    if (slide.subtitle) {
      ctx.fillStyle = '#c7dbc4';
      ctx.font = 'italic 17px "Inter", sans-serif';
      wrapText(slide.subtitle, canvas.width - 120).forEach((line) => {
        ctx.fillText(line, 60, headerY);
        headerY += 23;
      });
    }

    // Divider
    ctx.strokeStyle = '#e2f0d960';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(60, headerY + 10);
    ctx.lineTo(canvas.width - 60, headerY + 10);
    ctx.stroke();

    // Bullet points
    ctx.fillStyle = '#ffffffd0';
    ctx.font = '17px "Inter", sans-serif';
    let startY = headerY + 48;
    const bullets = [];
    bullets.forEach((b, i) => {
      const text = b.length > 70 ? b.slice(0, 67) + '...' : b;
      ctx.fillText(`• ${text}`, 60, startY + i * 65);
    });

    // Wrapped bullet points: show the full slide copy without ellipses.
    const wrappedBullets = slide.bullets || [];
    wrappedBullets.forEach((bullet) => {
      wrapText(bullet, canvas.width - 150).forEach((line, lineIndex) => {
        ctx.fillText(`${lineIndex === 0 ? '• ' : '  '}${line}`, 60, startY);
        startY += 23;
      });
      startY += 8;
    });

    // Page indicator
    ctx.fillStyle = '#e2f0d950';
    ctx.font = '18px "Inter", sans-serif';
    ctx.fillText(`Slide ${currentSlideIdx + 1} of ${slideList.length}`, 60, canvas.height - 55);

    // Dynamic burned-in subtitles at the bottom of blackboard if playing
    if (showCaptions && playing && !isRecording && current >= 0) {
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
  }, [currentSlideIdx, current, isRecording, playing, showCaptions, turns, slideList]);

  const updateCaptionOverlay = useCallback(() => {
    const canvas = captionCanvasRef.current;
    const texture = captionTextureRef.current;
    const mesh = captionMeshRef.current;
    if (!canvas || !texture || !mesh) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const shouldShow = isRecording && showCaptions && playing && current >= 0 && turns[current];
    mesh.visible = Boolean(shouldShow);
    if (!shouldShow) {
      texture.needsUpdate = true;
      return;
    }

    const turn = turns[current];
    const isHostA = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
    const speakerColor = isHostA ? '#a594f2' : '#f9a8d4';

    ctx.fillStyle = 'rgba(10, 10, 15, 0.92)';
    ctx.fillRect(18, 18, canvas.width - 36, canvas.height - 36);
    ctx.strokeStyle = `${speakerColor}99`;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

    ctx.fillStyle = speakerColor;
    ctx.font = 'bold 24px "Inter", sans-serif';
    ctx.fillText((turn.speaker?.split(' ')[0] || 'Host').toUpperCase(), 42, 62);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'italic 22px "Inter", sans-serif';
    const words = String(turn.text || '').split(/\s+/);
    const maxWidth = canvas.width - 210;
    const lines = [];
    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    // Scale the caption to fit every wrapped line. The exported overlay is
    // intentionally adaptive so long dialogue is never silently truncated.
    let captionFontSize = 22;
    let lineHeight = 27;
    let captionLines = lines;
    while (captionLines.length * lineHeight > 154 && captionFontSize > 12) {
      captionFontSize -= 1;
      lineHeight = Math.max(16, Math.round(captionFontSize * 1.22));
      ctx.font = `italic ${captionFontSize}px "Inter", sans-serif`;
      captionLines = [];
      let fittedLine = '';
      words.forEach((word) => {
        const candidate = fittedLine ? `${fittedLine} ${word}` : word;
        if (fittedLine && ctx.measureText(candidate).width > maxWidth) {
          captionLines.push(fittedLine);
          fittedLine = word;
        } else {
          fittedLine = candidate;
        }
      });
      if (fittedLine) captionLines.push(fittedLine);
    }
    captionLines.forEach((captionLine, index) => {
      ctx.fillText(captionLine, 170, 58 + index * lineHeight);
    });
    texture.needsUpdate = true;
  }, [current, isRecording, playing, showCaptions, turns]);

  updateBlackboardTextureRef.current = updateBlackboardTexture;
  updateCaptionOverlayRef.current = updateCaptionOverlay;

  // Redraw chalkboard when slide or speaker changes
  useEffect(() => {
    updateBlackboardTexture();
  }, [currentSlideIdx, current, playing, showCaptions, updateBlackboardTexture]);

  useEffect(() => {
    updateCaptionOverlay();
  }, [updateCaptionOverlay]);

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
    if (isRecording) {
      const recordingAudio = recordingAudioRef.current;
      if (!recordingAudio) return;
      if (paused) {
        recordingAudio.play()
          .then(() => setPaused(false))
          .catch((err) => setRecordingError(err?.message || 'Unable to resume the recording audio.'));
      } else {
        recordingAudio.pause();
        setPaused(true);
      }
      return;
    }
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
    if (isRecording) {
      stopRecording();
      return;
    }
    synthRef.current.cancel();
    setPlaying(false);
    setPaused(false);
    setCurrent(-1);
    setElapsed(0);
    clearInterval(timerRef.current);
  }

  const cleanupRecordingAudio = useCallback(() => {
    const audio = recordingAudioRef.current;
    if (audio) {
      audio.pause();
      audio.ontimeupdate = null;
      audio.onended = null;
      audio.removeAttribute('src');
      audio.load();
    }
    recordingAudioRef.current = null;
    mediaRecorderRef.current = null;
    if (recordingAudioContextRef.current) {
      recordingAudioContextRef.current.close().catch(() => {});
      recordingAudioContextRef.current = null;
    }
    if (recordingAudioUrlRef.current) {
      URL.revokeObjectURL(recordingAudioUrlRef.current);
      recordingAudioUrlRef.current = null;
    }
    recordingDurationsRef.current = [];
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
    cleanupRecordingAudio();
    synthRef.current.cancel();
    setIsRecording(false);
    setPlaying(false);
    setPaused(false);
    setCurrent(-1);
  }, [cleanupRecordingAudio]);

  const startRecording = useCallback(async () => {
    if (!rendererRef.current || !turns.length) return;
    recordedChunksRef.current = [];
    setRecordingError('');

    if (recordedVideoUrlRef.current) {
      URL.revokeObjectURL(recordedVideoUrlRef.current);
      recordedVideoUrlRef.current = null;
    }
    setRecordedVideoUrl(null);

    try {
      // Generate a real WAV narration first so recording never opens a
      // screen-sharing picker.
      const ttsResponse = await fetch(`${API_BASE}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turns }),
      });
      if (!ttsResponse.ok) {
        const detail = await ttsResponse.text();
        throw new Error(detail || 'The local speech service is unavailable.');
      }
      const ttsData = await ttsResponse.json();
      const binary = Uint8Array.from(atob(ttsData.audioBase64), char => char.charCodeAt(0));
      const audioUrl = URL.createObjectURL(new Blob([binary], { type: 'audio/wav' }));
      const audio = new Audio(audioUrl);
      audio.preload = 'auto';

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) throw new Error('This browser does not support audio recording.');
      const audioContext = new AudioContextClass();
      await audioContext.resume();
      const source = audioContext.createMediaElementSource(audio);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioContext.destination);

      const canvasStream = rendererRef.current.domElement.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const mimeType = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(type => MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = combinedStream;
      recordingAudioRef.current = audio;
      recordingAudioUrlRef.current = audioUrl;
      recordingAudioContextRef.current = audioContext;
      recordingDurationsRef.current = Array.isArray(ttsData.durations) ? ttsData.durations : [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        recordedVideoUrlRef.current = url;
        setRecordedVideoUrl(url);
        cleanupRecordingAudio();
      };

      audio.ontimeupdate = () => {
        const durations = recordingDurationsRef.current;
        let accumulated = 0;
        const nextTurn = durations.findIndex((duration) => {
          accumulated += duration;
          return audio.currentTime < accumulated;
        });
        if (nextTurn >= 0) setCurrent(nextTurn);
      };
      audio.onended = () => {
        setPlaying(false);
        setPaused(false);
        if (mediaRecorderRef.current?.state !== 'inactive') stopRecording();
      };

      recorder.start(250);
      setElapsed(0);
      setCurrent(0);
      setPlaying(true);
      setPaused(false);
      setIsRecording(true);
      await audio.play();
    } catch (err) {
      console.error('Error starting video capture:', err);
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        stopRecording();
      } else {
        recordingStreamRef.current?.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
        cleanupRecordingAudio();
        setIsRecording(false);
      }
      setRecordingError(err?.message || 'Unable to create the narrated recording.');
    }
  }, [cleanupRecordingAudio, stopRecording, turns]);

  useEffect(() => () => {
    if (recordedVideoUrlRef.current) URL.revokeObjectURL(recordedVideoUrlRef.current);
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    cleanupRecordingAudio();
  }, [cleanupRecordingAudio]);

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

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
    camera.position.set(0, 2.85, 7.0);
    camera.lookAt(0, 1.65, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 2. Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
    scene.add(ambientLight);

    // Broad warm key light from the camera side so faces and clothing read.
    const keyLight = new THREE.SpotLight(0xfff1dc, 5.5);
    keyLight.position.set(0, 6, 5);
    keyLight.target.position.set(0, 1.2, 0);
    keyLight.angle = Math.PI / 3;
    keyLight.penumbra = 0.7;
    keyLight.decay = 1.4;
    keyLight.castShadow = true;
    scene.add(keyLight, keyLight.target);

    // Cool fill and soft rim separate the hosts from the blackboard.
    const fillLight = new THREE.DirectionalLight(0x9fb7ff, 1.8);
    fillLight.position.set(-4, 3, 5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffb36b, 2.2);
    rimLight.position.set(0, 4, -4);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: '#151922', roughness: 0.88 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.position.z = 0.4;
    floor.receiveShadow = true;
    scene.add(floor);

    // 3. Studio Furniture
    // Load high-resolution 3D table asset
    const gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    gltfLoader.load('/table.glb', (gltf) => {
      const tableModel = gltf.scene;
      tableModel.position.set(0, 0.28, 0.55);
      tableModel.scale.set(1.9, 1.6, 1.8);
      tableModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(tableModel);
    }, undefined, (err) => {
      console.error("Error loading table GLB:", err);
    });

    const standMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.7 });

    // Matte black table surface/apron makes the desk readable even over the
    // darker imported table asset.
    const tableTop = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 0.16, 1.25),
      new THREE.MeshBasicMaterial({ color: '#05070b' })
    );
    tableTop.position.set(0, 1.16, 0.72);
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    scene.add(tableTop);

    const tableApron = new THREE.Mesh(
      new THREE.BoxGeometry(3.95, 0.48, 0.18),
      new THREE.MeshStandardMaterial({ color: '#11151d', roughness: 0.7 })
    );
    tableApron.position.set(0, 0.82, 0.98);
    tableApron.castShadow = true;
    scene.add(tableApron);

    function createChair(x, accent) {
      const chair = new THREE.Group();
      chair.position.set(x, 0, -0.05);
      const seatMat = new THREE.MeshStandardMaterial({ color: '#202735', roughness: 0.72 });
      const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.55, metalness: 0.15 });

      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.12, 0.86), seatMat);
      seat.position.set(0, 0.72, 0);
      seat.castShadow = true;
      chair.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.6, 0.14), seatMat);
      back.position.set(0, 1.42, -0.28);
      back.castShadow = true;
      chair.add(back);

      const backAccent = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.25, 0.16), accentMat);
      backAccent.position.set(0, 1.42, -0.38);
      chair.add(backAccent);

      [-0.5, 0.5].forEach((armX) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.62), accentMat);
        arm.position.set(armX, 1.05, -0.02);
        chair.add(arm);
      });

      [-0.34, 0.34].forEach((legX) => {
        [-0.28, 0.28].forEach((legZ) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.72, 8), accentMat);
          leg.position.set(legX, 0.36, legZ);
          chair.add(leg);
        });
      });
      scene.add(chair);
    }

    createChair(-2.55, '#7c6cf6');
    createChair(2.55, '#ec4899');

    // Microphones (kept high-quality procedural mics)
    function createMic(x, z, rotY) {
      const group = new THREE.Group();
      group.position.set(x, 1.23, z);
      group.rotation.y = rotY;

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.04, 16), standMat);
      group.add(base);

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 8), standMat);
      shaft.position.y = 0.22;
      group.add(shaft);

      const grill = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 12), new THREE.MeshStandardMaterial({ color: '#9aa2b1', roughness: 0.3, metalness: 0.35 }));
      grill.position.y = 0.48;
      group.add(grill);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.32, 8), standMat);
      arm.position.set(0, 0.38, -0.06);
      arm.rotation.z = Math.PI / 2.8;
      group.add(arm);

      scene.add(group);
    }
    createMic(-2.18, 0.98, -Math.PI / 10);
    createMic(2.18, 0.98, Math.PI / 10);

    // 4. Blackboard (Slide display)
    const boardCanvas = canvasRef.current;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTextureRef.current = boardTexture;

    const boardGeo = new THREE.BoxGeometry(5.2, 2.7, 0.08);
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.95 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 1.95, -1.8);
    board.receiveShadow = true;
    scene.add(board);

    // Wooden frame for board
    const frameGeo = new THREE.BoxGeometry(5.32, 2.82, 0.06);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#3d2511', roughness: 0.8 });
    const boardFrame = new THREE.Mesh(frameGeo, frameMat);
    boardFrame.position.set(0, 1.95, -1.82);
    scene.add(boardFrame);

    // Captions for exported video: this plane is part of the WebGL canvas,
    // unlike the regular HTML caption box shown in the live UI.
    const captionCanvas = document.createElement('canvas');
    captionCanvas.width = 1024;
    captionCanvas.height = 220;
    captionCanvasRef.current = captionCanvas;
    const captionTexture = new THREE.CanvasTexture(captionCanvas);
    captionTextureRef.current = captionTexture;
    const captionMaterial = new THREE.MeshBasicMaterial({
      map: captionTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const captionMesh = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.2), captionMaterial);
    captionMesh.position.set(0, 0.62, 2.35);
    captionMesh.renderOrder = 100;
    captionMesh.visible = false;
    captionMeshRef.current = captionMesh;
    scene.add(captionMesh);
    updateCaptionOverlayRef.current();

    // Load High-Resolution 3D Host Avatars from public folder GLBs.
    // The source files are authored at a tiny scale, so fit them to the
    // studio after loading instead of relying on their exported transforms.
    function prepareHostModel(model, x, z, rotationY) {
      model.updateMatrixWorld(true);
      const sourceBounds = new THREE.Box3().setFromObject(model);
      const sourceSize = sourceBounds.getSize(new THREE.Vector3());
      const targetHeight = 1.9;
      if (sourceSize.y > 0) {
        model.scale.multiplyScalar(targetHeight / sourceSize.y);
      }

      model.updateMatrixWorld(true);
      const fittedBounds = new THREE.Box3().setFromObject(model);
      const basePosition = 0.28 - fittedBounds.min.y;

      model.position.set(x, basePosition, z);
      model.rotation.y = rotationY;
      const bones = {};
      model.traverse((child) => {
        if (child.isBone) bones[child.name] = child;
      });

      // The source avatars are authored in a T-pose. Bend the legs and arms
      // so the table/chairs read as a seated conversation rather than a stage
      // lineup, while keeping the original GLB materials and faces.
      ['LeftUpLeg', 'RightUpLeg'].forEach((name) => {
        if (bones[name]) bones[name].rotation.x = -1.0;
      });
      ['LeftLeg', 'RightLeg'].forEach((name) => {
        if (bones[name]) bones[name].rotation.x = 1.2;
      });
      if (bones.LeftArm) bones.LeftArm.rotation.z = -0.55;
      if (bones.RightArm) bones.RightArm.rotation.z = 0.55;
      if (bones.LeftForeArm) bones.LeftForeArm.rotation.z = 0.9;
      if (bones.RightForeArm) bones.RightForeArm.rotation.z = -0.9;
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(model);
      model.userData = { basePosition, baseRotationY: rotationY };
    }

    // Load Host A (Alex)
    gltfLoader.load('/male.glb', (gltf) => {
      const model = gltf.scene;
      prepareHostModel(model, -2.55, 0.65, Math.PI / 10);
      hostARef.current = model;
    }, undefined, (err) => {
      console.error("Error loading male avatar GLB:", err);
    });

    // Load Host B (Jordan)
    gltfLoader.load('/female.glb', (gltf) => {
      const model = gltf.scene;
      prepareHostModel(model, 2.55, 0.65, -Math.PI / 10);
      hostBRef.current = model;
    }, undefined, (err) => {
      console.error("Error loading female avatar GLB:", err);
    });

    // Initial chalkboard render
    updateBlackboardTextureRef.current();

    // ── Animation Frame Loop ─────────────────────────────────────
    let clock = new THREE.Clock();

    function animate() {
      animationFrameRef.current = requestAnimationFrame(animate);
      const time = clock.getElapsedTime();

      // Subtle breathing animations for both hosts
      if (hostARef.current && hostBRef.current) {
        hostARef.current.position.y = (hostARef.current.userData.basePosition || 0) + Math.sin(time * 1.5) * 0.008;
        hostBRef.current.position.y = (hostBRef.current.userData.basePosition || 0) + Math.sin(time * 1.6 + 0.5) * 0.008;

        hostARef.current.rotation.z = 0;
        hostBRef.current.rotation.z = 0;
        hostARef.current.rotation.y = hostARef.current.userData.baseRotationY || Math.PI / 4;
        hostBRef.current.rotation.y = hostBRef.current.userData.baseRotationY || -Math.PI / 4;

      }

      // Speak animations (if playing and speaking)
      const playback = playbackRef.current;
      if (playback.playing && !playback.paused && playback.current >= 0 && playback.turns[playback.current]) {
        const turn = playback.turns[playback.current];
        const isA  = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
        const activeHost = isA ? hostARef.current : hostBRef.current;

        if (activeHost) {
          // Bob the model up and down slightly to simulate talking
          activeHost.position.y = (activeHost.userData.basePosition || 0) + Math.abs(Math.sin(time * 6)) * 0.035;
          activeHost.rotation.y = (activeHost.userData.baseRotationY || (isA ? Math.PI / 4 : -Math.PI / 4)) + Math.sin(time * 5) * 0.05;
          activeHost.rotation.z = Math.sin(time * 4) * 0.015;

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
      renderer.dispose();
      rendererRef.current = null;
      hostARef.current = null;
      hostBRef.current = null;
      captionTexture.dispose();
      captionMaterial.dispose();
      captionMesh.geometry.dispose();
      captionCanvasRef.current = null;
      captionTextureRef.current = null;
      captionMeshRef.current = null;
    };
  }, []);

  function fmtTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return (
    <div className="video-studio-live-root">
      
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
        className="video-stage"
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
            borderRadius: 12, padding: '10px 18px', display: isRecording ? 'none' : 'flex',
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

      {recordingError && (
        <div style={{
          background: 'rgba(127, 29, 29, 0.22)',
          color: '#fecaca',
          borderTop: '1px solid rgba(248, 113, 113, 0.35)',
          borderBottom: '1px solid rgba(248, 113, 113, 0.25)',
          fontSize: 12,
          padding: '8px 20px',
        }}>
          {recordingError}
        </div>
      )}

      {/* Video Studio Controls */}
      <div className="audio-controls video-studio-controls">
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="audio-btn play-btn" onClick={handlePlayPause}>
            {playing && !paused ? '⏸' : '▶'}
          </button>
          <button className="audio-btn" onClick={handleStop}>⏹</button>
          <span className="audio-time" style={{ marginLeft: 8 }}>{fmtTime(elapsed)}</span>
          
          <button
            onClick={isRecording ? stopRecording : startRecording}
            title="Record the 3D scene with generated narration and burned-in captions."
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
            <span>{isRecording ? '⏹ Stop Recording' : '🎥 Record Video'}</span>
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {recordedVideoUrl && !isRecording && (
            <a
              href={recordedVideoUrl}
              download="presentation_3d_recording.webm"
              style={{
                color: 'var(--accent-lit)',
                border: '1px solid var(--accent)66',
                background: 'var(--accent-dim)',
                fontSize: 12,
                padding: '6px 12px',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Download Video
            </a>
          )}
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
