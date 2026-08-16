import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { HDRLoader as RGBELoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';

// Studio Module Imports
import { MAT, rand } from './studio/materials.js';
import { addMesh, createBox, createCylinder } from './studio/helpers.js';
import { createHeroPlant, createTrailingPlant } from './studio/plants.js';
import { createDetailedShelf } from './studio/shelves.js';
import { createPremiumDesk } from './studio/desk.js';
import { createChair } from './studio/chairs.js';
import { setupMicrophones } from './studio/microphones.js';
import { setupLighting } from './studio/lighting.js';
import { setupEnvironment } from './studio/environment.js';
import { createTableDecor } from './studio/tableDecor.js';
import { setupDisplay } from './studio/display.js';
import { setupBranding } from './studio/branding.js';
import { setupAvatars } from './studio/avatars.js';


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
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  const [avatarA, setAvatarA]   = useState('Sitting Idle.fbx');
  const [avatarB, setAvatarB]   = useState('Sitting Idle (1).fbx');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
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
  const composerRef = useRef(null);
  const bokehPassRef = useRef(null);
  const hostARef = useRef(null); // Host A mesh group
  const hostBRef = useRef(null); // Host B mesh group
  const mixersRef = useRef([]); // Three.js AnimationMixers
  const boardTextureRef = useRef(null); // canvas texture for chalkboard
  const updateBlackboardTextureRef = useRef(() => {});
  const captionCanvasRef = useRef(null);
  const captionTextureRef = useRef(null);
  const captionMeshRef = useRef(null);
  const updateCaptionOverlayRef = useRef(() => {});
  const animationFrameRef = useRef(null);
  const playbackRef = useRef({ playing: false, paused: false, current: -1, turns: [] });
  const shotPlanRef = useRef([]);

  const turns = useMemo(() => Array.isArray(script) ? script : EMPTY_LIST, [script]);
  const slideList = useMemo(() => Array.isArray(slides) ? slides : EMPTY_LIST, [slides]);

  useEffect(() => {
    playbackRef.current = { playing, paused, current, turns };
  }, [playing, paused, current, turns]);

  useEffect(() => {
    if (!turns || turns.length === 0) {
      shotPlanRef.current = [];
      return;
    }
    const plan = [];
    let lastShot = 'ESTABLISH';
    
    for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const isA = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
        const text = turn.text || "";
        const lowerText = text.toLowerCase();
        
        // Simple hash for deterministic decisions
        let hash = 0;
        for (let j = 0; j < text.length; j++) {
            hash = Math.imul(31, hash) + text.charCodeAt(j) | 0;
        }
        const seededRandom = () => {
            hash = Math.imul(741103597, hash) + 1 | 0;
            return (hash >>> 0) / 4294967296;
        };
        
        let shot = 'ESTABLISH';
        let motion = 'none';
        let intent = 'explain';

        // NLP heuristics for semantic intent
        if (lowerText.includes('?')) intent = 'ask';
        else if (lowerText.includes('!')) intent = 'emphasize';
        else if (lowerText.match(/(exactly|yes|agree|absolutely|right|interesting)/)) intent = 'react';

        // Assign shot based on intent and text length
        if (i === 0 || (i % 8 === 0 && text.length > 50)) {
            shot = 'ESTABLISH';
            motion = 'slow_push';
        } else if (text.length < 50 && intent !== 'react') {
            shot = 'TWO_SHOT';
            motion = 'slow_push';
        } else if (lowerText.match(/(slide|board|diagram|here we see|look at)/)) {
            shot = 'BOARD';
            motion = 'none';
        } else if (intent === 'ask') {
            shot = isA ? 'OTS_A' : 'OTS_B';
            motion = 'orbit';
        } else if (intent === 'react') {
            // Cut to the other person reacting, or keep current speaker if it's a strong reaction
            shot = (seededRandom() > 0.5) ? (isA ? 'REACTION_B' : 'REACTION_A') : (isA ? 'CU_A' : 'CU_B');
            motion = 'none';
        } else {
            shot = isA ? 'CU_A' : 'CU_B';
            motion = 'slow_push';
            // Occasionally cut to reaction of other host for long dialogue
            if (text.length > 150 && seededRandom() > 0.8) {
                shot = isA ? 'REACTION_B' : 'REACTION_A';
            }
        }
        
        const focusTarget = shot === 'BOARD' ? 'board' : 
                            (shot.includes('_A') || (shot === 'TWO_SHOT' && isA) ? 'hostA' : 'hostB');
        
        plan.push({ shot, motion, focusTarget, intent });
    }
    shotPlanRef.current = plan;
  }, [turns]);

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

    // Rich Cyan-to-Purple Deep Gradient Background (matching target reference)
    const bgGrad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bgGrad.addColorStop(0, '#1a3c4f');    // Deep teal cyan on top-left
    bgGrad.addColorStop(0.5, '#1e2b4a');  // Moody deep blue in center
    bgGrad.addColorStop(1, '#2f204c');    // Rich violet purple on bottom-right
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle ambient vignette
    const vignette = ctx.createRadialGradient(
      canvas.width * 0.45, canvas.height * 0.45, 100,
      canvas.width * 0.5, canvas.height * 0.5, canvas.width * 0.75
    );
    vignette.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
    vignette.addColorStop(0.8, 'rgba(0, 0, 0, 0.25)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const slide = slideList[currentSlideIdx];
    if (!slide) {
      // Empty presentation state
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 52px "Inter", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('A I  S T U D I O', canvas.width / 2, canvas.height / 2 - 20);
      ctx.fillStyle = '#23D5FF';
      ctx.font = '24px "Inter", sans-serif';
      ctx.fillText('WAITING FOR SIGNAL...', canvas.width / 2, canvas.height / 2 + 30);
      if (boardTextureRef.current) boardTextureRef.current.needsUpdate = true;
      return;
    }

    // Draw Slide contents
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

    // Header Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px "Inter", sans-serif';
    let headerY = 110;
    wrapText(slide.title, canvas.width - 160).forEach((line) => {
      ctx.fillText(line, 80, headerY);
      headerY += 50;
    });

    if (slide.subtitle) {
      ctx.fillStyle = '#23D5FF';
      ctx.font = '300 24px "Inter", sans-serif';
      wrapText(slide.subtitle, canvas.width - 160).forEach((line) => {
        ctx.fillText(line, 80, headerY);
        headerY += 34;
      });
    }

    // Divider
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(80, headerY + 20);
    ctx.lineTo(canvas.width - 80, headerY + 20);
    ctx.stroke();

    // Determine how many bullets to show based on conversation progress within this slide
    // Map current turn index to a percentage of completion for the current slide
    const turnsPerSlide = Math.max(1, Math.ceil(turns.length / slideList.length));
    const turnsInThisSlide = current - (currentSlideIdx * turnsPerSlide);
    const progressRatio = Math.max(0, Math.min(1, (turnsInThisSlide + 1) / turnsPerSlide));
    
    const wrappedBullets = slide.bullets || [];
    const visibleBulletsCount = Math.max(1, Math.ceil(wrappedBullets.length * progressRatio));

    // Cards layout (replacing bullet points)
    let startY = headerY + 50;
    wrappedBullets.slice(0, visibleBulletsCount).forEach((bullet, idx) => {
      // Highlight the newest card, dim the older ones
      const isLatest = idx === visibleBulletsCount - 1;
      
      const cardHeight = Math.max(60, wrapText(bullet, canvas.width - 200).length * 34 + 30);
      
      // Draw card background
      ctx.fillStyle = isLatest ? '#1e293b' : '#0f172a';
      ctx.beginPath();
      ctx.roundRect(80, startY, canvas.width - 160, cardHeight, 12);
      ctx.fill();

      // Draw active indicator (glowing left edge)
      if (isLatest) {
         ctx.fillStyle = '#23D5FF';
         ctx.beginPath();
         ctx.roundRect(80, startY, 6, cardHeight, [12, 0, 0, 12]);
         ctx.fill();
      }

      // Draw text inside card
      ctx.fillStyle = isLatest ? '#F8FAFC' : '#94A3B8';
      ctx.font = isLatest ? '500 22px "Inter", sans-serif' : '400 22px "Inter", sans-serif';
      
      let textY = startY + 36;
      wrapText(bullet, canvas.width - 220).forEach((line) => {
        ctx.fillText(line, 110, textY);
        textY += 34;
      });
      startY += cardHeight + 20;
    });

    // Subtitle indicator (small pill at top right)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(canvas.width - 160, 45, 100, 36, 18);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 16px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${currentSlideIdx + 1} / ${slideList.length}`, canvas.width - 110, 68);

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

  // ── Draw 3D Captions ──────────────────────────────────────────
  const updateCaptionOverlay = useCallback(() => {
    const canvas = captionCanvasRef.current;
    const texture = captionTextureRef.current;
    const mesh = captionMeshRef.current;
    if (!canvas || !texture || !mesh) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showCaptions || !playing || current < 0) {
      mesh.visible = false;
      return;
    }

    const turn = turns[current];
    if (!turn || !turn.text) {
      mesh.visible = false;
      return;
    }
    
    // Only show during actual video recording/playback logic to avoid UI clutter
    mesh.visible = isRecording; 

    const isHostA = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
    const speakerColor = isHostA ? '#23D5FF' : '#7C5CFF';

    // Dark translucent glass pill
    ctx.fillStyle = 'rgba(11, 16, 32, 0.85)';
    ctx.beginPath();
    ctx.roundRect(40, 20, canvas.width - 80, canvas.height - 40, 30);
    ctx.fill();
    
    // Border glow
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 20, canvas.width - 80, canvas.height - 40, 30);

    // Speaker indicator dot
    ctx.fillStyle = speakerColor;
    ctx.beginPath();
    ctx.arc(80, canvas.height / 2, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = '500 24px "Inter", sans-serif';
    
    // Get just the current sentence/phrase (approximation for demo)
    const words = String(turn.text || '').split(/\s+/);
    // Determine which portion of words to show based on elapsed time if we had accurate word timings
    // For now, limit to a clean 1-2 lines to avoid the "huge paragraph" issue
    let displayWords = words.slice(0, 20); // Just show the beginning of the phrase
    if (words.length > 20) displayWords.push('...');

    const maxWidth = canvas.width - 160;
    let line = '';
    const lines = [];
    
    displayWords.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);

    const startY = lines.length === 1 ? (canvas.height / 2 + 8) : (canvas.height / 2 - 8);
    lines.forEach((l, i) => {
      ctx.fillText(l, 110, startY + i * 32);
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
    // Do NOT stop tracks or cleanup audio synchronously here,
    // otherwise the final chunk may be corrupted. 
    // They are handled inside recorder.onstop().
    synthRef.current.cancel();
    setIsRecording(false);
    setPlaying(false);
    setPaused(false);
    setCurrent(-1);
  }, []);

  const startRecording = useCallback(async () => {
    if (!rendererRef.current || !turns.length) return;

    // Stop any regular TTS playback before recording starts
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    setPlaying(false);
    setPaused(false);
    clearInterval(timerRef.current);

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

      // Force 1920x1080 internal resolution for capture
      rendererRef.current.setSize(1920, 1080, false);
      const canvasStream = rendererRef.current.domElement.captureStream(30);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...destination.stream.getAudioTracks(),
      ]);
      const mimeType = [
        'video/webm;codecs=vp8,opus',
        'video/webm;codecs=vp9,opus',
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
        
        // Restore renderer size to original UI dimensions
        if (rendererRef.current) {
            const container = rendererRef.current.domElement.parentElement;
            if (container) {
                rendererRef.current.setSize(container.clientWidth, container.clientHeight, false);
            }
        }
        
        recordingStreamRef.current?.getTracks().forEach(track => track.stop());
        recordingStreamRef.current = null;
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

      recorder.start(1000);
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
    const height = container.clientHeight || 420;

    // 1. Scene & Renderer (Dedicated Broadcast Studio Aesthetic)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#07090e');
    sceneRef.current = scene;

    new RGBELoader().load('/studio.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
    }, undefined, (err) => {
      console.warn('Could not load /studio.hdr, using default lighting only.', err);
    });

    THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      setLoadingProgress(Math.floor((itemsLoaded / itemsTotal) * 100));
    };
    THREE.DefaultLoadingManager.onLoad = () => {
      setLoadingProgress(100);
    };

    const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 1000); // 50mm cinematic eye-level equivalent
    camera.position.set(0, 1.28, 4.65);
    camera.lookAt(0, 1.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
    bloomPass.threshold = 2.0;
    bloomPass.strength = 0.14;
    bloomPass.radius = 0.38;
    composer.addPass(bloomPass);

    const bokehPass = new BokehPass(scene, camera, {
      focus: 5.0,
      aperture: 0.00008,
      maxblur: 0.005,
      width: width,
      height: height
    });
    composer.addPass(bokehPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    composerRef.current = composer;
    bokehPassRef.current = bokehPass;


    // 2. Lights & Atmosphere
    const { shelfLights } = setupLighting(scene);
    scene.userData.shelfLights = shelfLights;

    // 3. Environment (Wood slats, blue baseboard LED, luxury rug, concrete floor)
    const { neons, fgMicArm } = setupEnvironment(scene);
    scene.userData.neons = neons;
    scene.userData.fgMicArm = fgMicArm;

    // 4. Studio Decor & Architecture
    const decorRoot = new THREE.Group();
    decorRoot.name = 'StudioDecorRoot';
    scene.add(decorRoot);

    // Hero Tropical Strelitzia in Concrete Pot
    const heroPlant = createHeroPlant(scene, -3.4, -1.35, 0.95);

    // Shelving Units
    const leftShelf = createDetailedShelf(decorRoot, -3.85, -2.35, 'left');
    const rightShelf = createDetailedShelf(decorRoot, 3.85, -2.35, 'right');

    // Table Props (Matte black mugs, succulent dish, notebooks)
    const tableDecor = createTableDecor(scene);

    scene.userData.decor = {
      heroPlant,
      leftShelf,
      rightShelf,
      tableDecor
    };

    // 5. Architectural Studio Desk & Mid-Century Chairs
    createPremiumDesk(scene);

    // Mid-Century Scandinavian Chairs angled inward toward table & partner
    createChair(scene, -1.55, null, 0.38);
    createChair(scene, 1.55, null, -0.38);

    // Studio Branding
    setupBranding(scene);

    // Broadcast Microphones
    const mics = setupMicrophones(scene);
    scene.userData.mics = mics;

    // 4. LED Display Wall
    const boardCanvas = canvasRef.current;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTextureRef.current = boardTexture;

    const { boardMesh, captionMesh, captionTexture, captionCanvas } = setupDisplay(scene, boardCanvas, boardTexture);
    captionCanvasRef.current = captionCanvas;
    captionTextureRef.current = captionTexture;
    captionMeshRef.current = captionMesh;
    updateCaptionOverlayRef.current();

    // 5. Load Host Avatars
    setupAvatars(scene, avatarA, avatarB, hostARef, hostBRef, mixersRef);

    // Initial chalkboard render
    updateBlackboardTextureRef.current();

    // ── Animation Frame Loop ─────────────────────────────────────
    let lastTime = performance.now();
    let startTime = lastTime;

    const CAM_TARGETS = {
      ESTABLISH: { pos: new THREE.Vector3(0, 1.28, 4.65), look: new THREE.Vector3(0, 1.15, 0) },
      TWO_SHOT: { pos: new THREE.Vector3(0, 1.22, 2.75), look: new THREE.Vector3(0, 1.12, 0.4) },
      CU_A: { pos: new THREE.Vector3(-1.35, 1.24, 1.85), look: new THREE.Vector3(-1.55, 1.22, 0.5) },
      CU_B: { pos: new THREE.Vector3(1.35, 1.24, 1.85), look: new THREE.Vector3(1.55, 1.22, 0.5) },
      OTS_A: { pos: new THREE.Vector3(1.05, 1.24, 1.15), look: new THREE.Vector3(-1.55, 1.22, 0.5) },
      OTS_B: { pos: new THREE.Vector3(-1.05, 1.24, 1.15), look: new THREE.Vector3(1.55, 1.22, 0.5) },
      REACTION_A: { pos: new THREE.Vector3(-1.38, 1.22, 1.9), look: new THREE.Vector3(-1.55, 1.22, 0.5) },
      REACTION_B: { pos: new THREE.Vector3(1.38, 1.22, 1.9), look: new THREE.Vector3(1.55, 1.22, 0.5) },
      BOARD: { pos: new THREE.Vector3(0.1, 1.65, 3.8), look: new THREE.Vector3(0.1, 2.25, -2.48) }
    };
    camera.userData.targetLook = new THREE.Vector3(0, 1.15, 0);

    // Pre-allocate vectors to avoid GC pressure
    const tmpLookA = new THREE.Vector3();
    const tmpLookB = new THREE.Vector3();

    function animate() {
      animationFrameRef.current = requestAnimationFrame(animate);
      const now = performance.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      const time = (now - startTime) / 1000;

      // ── Dynamic Gaze & Layered Animation ──
      const playback = playbackRef.current;
      let stateA = 'idle';
      let stateB = 'idle';

      if (hostARef.current && hostBRef.current) {
        tmpLookA.set(2.4, 1.65, 0); // Default look at B
        tmpLookB.set(-2.4, 1.65, 0); // Default look at A

        stateA = 'listen';
        stateB = 'listen';

        if (playback.playing && !playback.paused && playback.current >= 0 && playback.turns[playback.current]) {
          const turn = playback.turns[playback.current];
          const isA  = turn.speaker?.toLowerCase().includes('host a') || turn.speaker?.toLowerCase().includes('alex');
          const currentPlan = shotPlanRef.current[playback.current] || {};
          
          // Generate a pseudo-random seed based on time to switch gaze occasionally
          const gazeCycle = Math.floor(time * 0.4) % 10; 
          
          if (isA) {
             stateA = currentPlan.intent === 'emphasize' ? 'gesture' : 'talk';
             if (gazeCycle < 7) tmpLookA.set(2.4, 1.65, 0); // 70% at co-host
             else if (gazeCycle < 9) tmpLookA.copy(camera.position); // 20% at camera
             else tmpLookA.copy(CAM_TARGETS.BOARD.look); // 10% at board
             
             tmpLookB.set(-2.4, 1.65, 0); // B always looks at A while listening
          } else {
             stateB = currentPlan.intent === 'emphasize' ? 'gesture' : 'talk';
             if (gazeCycle < 7) tmpLookB.set(-2.4, 1.65, 0); // 70% at co-host
             else if (gazeCycle < 9) tmpLookB.copy(camera.position); // 20% at camera
             else tmpLookB.copy(CAM_TARGETS.BOARD.look); // 10% at board
             
             tmpLookA.set(2.4, 1.65, 0); // A always looks at B while listening
          }
        } else {
          stateA = 'idle';
          stateB = 'idle';
        }

        const fadeToAction = (host, state) => {
           if (!host.userData.actions) return;
           const newAction = host.userData.actions[state];
           if (newAction && newAction !== host.userData.activeAction) {
              newAction.reset().play();
              host.userData.activeAction.crossFadeTo(newAction, 0.5, true);
              host.userData.activeAction = newAction;
           }
        };

        fadeToAction(hostARef.current, stateA);
        fadeToAction(hostBRef.current, stateB);
      }

      // ── Semantic AI Director & Camera Cinematography ──
      let activeCamTarget = CAM_TARGETS.ESTABLISH;
      let cameraMotion = { pushIn: false, orbit: false, slow_push: false };
      let activeFocusTarget = 'board';
      let activeShotName = 'ESTABLISH';
      
      const shotPlan = shotPlanRef.current;
      if (playback.playing && !playback.paused && playback.current >= 0 && playback.current < shotPlan.length) {
         const plan = shotPlan[playback.current];
         activeCamTarget = CAM_TARGETS[plan.shot] || CAM_TARGETS.ESTABLISH;
         activeShotName = plan.shot;
         if (plan.motion === 'pushIn') cameraMotion.pushIn = true;
         if (plan.motion === 'orbit') cameraMotion.orbit = true;
         if (plan.motion === 'slow_push') cameraMotion.slow_push = true;
         activeFocusTarget = plan.focusTarget;
      }

      // ── Perform Cuts and Movements ──
      // If the shot changed, cut instantly.
      if (camera.userData.currentShot !== activeShotName) {
         camera.position.copy(activeCamTarget.pos);
         camera.userData.targetLook.copy(activeCamTarget.look);
         camera.userData.currentShot = activeShotName;
         
         // Toggle foreground elements for close-ups
         if (scene.userData.fgMicArm) {
             const isCU = activeShotName === 'CU_A' || activeShotName === 'CU_B' || activeShotName.startsWith('OTS_');
             scene.userData.fgMicArm.visible = isCU;
         }
      } else {
         // Shot is identical, apply slow motivated movement instead of aggressive lerps
         if (cameraMotion.pushIn || cameraMotion.slow_push) {
            const speed = cameraMotion.pushIn ? 0.05 : 0.02;
            const viewDir = activeCamTarget.look.clone().sub(camera.position).normalize();
            camera.position.add(viewDir.multiplyScalar(speed * delta));
         }
         if (cameraMotion.orbit) {
            camera.position.x += Math.sin(time * 0.1) * 0.02 * delta;
            camera.position.z += Math.cos(time * 0.1) * 0.01 * delta;
         }
      }
      
      // Camera Breathing (handheld feel)
      const handheldOffsetX = Math.sin(time * 0.4) * 0.001;
      const handheldOffsetY = Math.cos(time * 0.5) * 0.001;
      camera.position.x += handheldOffsetX;
      camera.position.y += handheldOffsetY;

      camera.lookAt(camera.userData.targetLook);

      // Environmental Animations & Audio Reactivity

      // ================================================================
      // BOTANICAL AMBIENT MOTION
      // ================================================================
      
      if (scene.userData.decor?.heroPlant) {
      
        const plant = scene.userData.decor.heroPlant;
        const leaves = plant.userData.leaves || [];
        const t = time * 0.55;
        const phase = plant.userData.animationPhase || 0;
      
        leaves.forEach((leaf, index) => {
      
          const baseZ =
            leaf.userData.baseZ ??
            leaf.rotation.z;
      
          if (leaf.userData.baseZ === undefined) {
            leaf.userData.baseZ = baseZ;
          }
      
          leaf.rotation.z =
            baseZ +
            Math.sin(
              t * 0.8 +
              index * 0.35 +
              phase
            ) * 0.018;
      
          leaf.rotation.x +=
            Math.sin(
              t * 0.55 +
              index
            ) * 0.0008;
        });
      }
      
      // Subtle shelf light breathing
      if (scene.userData.shelfLights) {
        scene.userData.shelfLights.forEach(
          (light, index) => {
            light.intensity =
              0.42 +
              Math.sin(
                time * 0.4 + index
              ) * 0.035;
          }
        );
      }
      if (scene.userData.neons) {
        const baseIntensity = 2.2;
        const pulse = Math.sin(time * 2.0) * 0.3;
        scene.userData.neons.forEach(mat => {
          if (mat) mat.emissiveIntensity = baseIntensity + pulse;
        });
      }


      let audioNoise = 0;
      if (playback.playing && !playback.paused) {
         // High-frequency noise mimicking audio RMS
         audioNoise = Math.max(0, (Math.sin(time * 40) + Math.sin(time * 60) * 0.5));
      }

      if (scene.userData.mics) {
         scene.userData.mics.a.emissiveIntensity = (stateA === 'talk' || stateA === 'gesture') ? audioNoise * 2.5 + 0.5 : 0;
         scene.userData.mics.b.emissiveIntensity = (stateB === 'talk' || stateB === 'gesture') ? audioNoise * 2.5 + 0.5 : 0;
      }

      // Update GLB animation mixers
      for (const mixer of mixersRef.current) {
        mixer.update(delta);
      }

      // ── Apply Bone-Level Gaze and Lip Sync (After mixer overrides it) ──
      if (hostARef.current && hostBRef.current) {
        const applyBones = (host, target, baseRot, isTalking) => {
           const dx = target.x - host.position.x;
           const dz = target.z - host.position.z;
           let targetRotY = Math.atan2(dx, dz);
           
           // Clamp the requested global rotation
           const maxTwist = Math.PI / 3;
           if (targetRotY > baseRot + maxTwist) targetRotY = baseRot + maxTwist;
           if (targetRotY < baseRot - maxTwist) targetRotY = baseRot - maxTwist;
           
           const deltaRot = targetRotY - baseRot;

           if (host.userData.bones && host.userData.bones.head) {
              // Micro-animation (breathing & drifting)
              const breath = Math.sin(time * 2.5 + (host.position.x)) * 0.005;
              const driftY = Math.sin(time * 1.5 + (host.position.x)) * 0.05;
              const nod = (host.userData.activeAction?.name === 'listen' && Math.sin(time * 4) > 0.8) ? 0.05 : 0;
              
              if (host.userData.bones.spine) {
                 host.userData.bones.spine.rotation.y = deltaRot * 0.05 + driftY;
                 host.userData.bones.spine.position.y = host.userData.baseSpineY + breath * 1.5; // More pronounced
              }
              // Add subtle arm sway if arms exist
              if (host.userData.bones.leftArm) {
                 host.userData.bones.leftArm.rotation.z += Math.sin(time * 1.2) * 0.002;
              }
              if (host.userData.bones.rightArm) {
                 host.userData.bones.rightArm.rotation.z -= Math.sin(time * 1.3) * 0.002;
              }
              if (host.userData.bones.neck) host.userData.bones.neck.rotation.y = deltaRot * 0.15;
              if (host.userData.bones.head) {
                 host.userData.bones.head.rotation.y = deltaRot * 0.30;
                 host.userData.bones.head.rotation.x = nod; // micro nod
              }
              
              // Simulate Lip-Sync
              if (isTalking && audioNoise > 0.1) {
                  const mouthOpen = audioNoise * 0.15; // Roughly 0 to 0.2 rad
                  if (host.userData.bones.jaw) {
                      host.userData.bones.jaw.rotation.x = mouthOpen;
                  } else if (host.userData.meshWithMorphs) {
                      const dict = host.userData.meshWithMorphs.morphTargetDictionary;
                      const influences = host.userData.meshWithMorphs.morphTargetInfluences;
                      for (const key in dict) {
                          if (key.toLowerCase().includes('mouth') || key.toLowerCase().includes('jaw')) {
                              influences[dict[key]] = mouthOpen * 3.0; // scale up for blendshape (0-1)
                          }
                      }
                  } else {
                      // Fallback: slightly rotate head up and down to simulate talking
                      host.userData.bones.head.rotation.x += mouthOpen * 0.2;
                  }
              }

              // Keep body slightly turned (lerped)
              host.rotation.y += (baseRot + (deltaRot * 0.1) - host.rotation.y) * 0.1;
           } else {
              host.rotation.y += (targetRotY - host.rotation.y) * 0.1;
           }
        };

        applyBones(hostARef.current, tmpLookA, hostARef.current.userData.baseRotationY || Math.PI/4, stateA === 'talk' || stateA === 'gesture');
        applyBones(hostBRef.current, tmpLookB, hostBRef.current.userData.baseRotationY || -Math.PI/4, stateB === 'talk' || stateB === 'gesture');
      }

      // Update Bokeh Focus Distance
      if (bokehPassRef.current) {
        let focusDist = camera.position.distanceTo(camera.userData.targetLook);
        
        if (activeFocusTarget === 'hostA' && hostARef.current) {
           focusDist = camera.position.distanceTo(hostARef.current.position);
        } else if (activeFocusTarget === 'hostB' && hostBRef.current) {
           focusDist = camera.position.distanceTo(hostBRef.current.position);
        } else if (activeFocusTarget === 'board') {
           focusDist = camera.position.distanceTo(CAM_TARGETS.BOARD.look);
        }
        
        // Lerp the focus distance for smooth racks
        bokehPassRef.current.uniforms['focus'].value += (focusDist - bokehPassRef.current.uniforms['focus'].value) * 0.05;
      }

      if (composerRef.current) {
        composerRef.current.render();
      } else {
        renderer.render(scene, camera);
      }
    }
    animate();

    // ── Resize handler ───────────────────────────────────────────
    const handleResize = () => {
      if (!mountRef.current || !rendererRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
      if (composerRef.current) composerRef.current.setSize(w, h);
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
      mixersRef.current = []; // Clear mixer array to prevent memory leak
      captionTexture.dispose();
      captionMesh.material.dispose();
      captionMesh.geometry.dispose();
      captionCanvasRef.current = null;
      captionTextureRef.current = null;
      captionMeshRef.current = null;
    };
  }, [avatarA, avatarB]); // Re-initialize scene if these change

  function fmtTime(secs) {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return (
    <div className="video-studio-live-root" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative' }}>
      
      {/* Top Bar for settings */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', zIndex: 10 }}>
        <button 
          onClick={() => setShowSettingsModal(true)}
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          ⚙️ Studio Settings
        </button>
      </div>

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
        style={{ position: 'relative', flex: 1, minHeight: 0 }}
      >
        {loadingProgress < 100 && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: '#0a0a0f', zIndex: 100, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: '#fff', borderRadius: '12px'
          }}>
            <div style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Studio is Loading...</div>
            <div style={{ width: '60%', height: 6, background: '#333', borderRadius: 3, overflow: 'hidden', maxWidth: '300px' }}>
              <div style={{ width: `${loadingProgress}%`, height: '100%', background: '#38bdf8', transition: 'width 0.2s' }} />
            </div>
            <div style={{ marginTop: 10, color: '#94a3b8' }}>{loadingProgress}%</div>
          </div>
        )}
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
            <p style={{ margin: 0, fontSize: 13, color: '#ffffff', textAlign: 'left', fontStyle: 'italic', lineHeight: 1.4 }}>
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

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px', width: '400px', maxWidth: '90%', display: 'flex', flexDirection: 'column', gap: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Studio Settings</div>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 16 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Host A (Left)</label>
                <select value={avatarA} onChange={e => setAvatarA(e.target.value)} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>

                  <option value="male.glb">Ready Player Me (Male)</option>
                  <option value="female.glb">Ready Player Me (Female)</option>
                  <option value="Sitting Idle.fbx">Animated FBX (Sitting Idle)</option>
                  <option value="Sitting Idle (1).fbx">Animated FBX (Sitting Idle 2)</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Host B (Right)</label>
                <select value={avatarB} onChange={e => setAvatarB(e.target.value)} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>

                  <option value="male.glb">Ready Player Me (Male)</option>
                  <option value="female.glb">Ready Player Me (Female)</option>
                  <option value="Sitting Idle.fbx">Animated FBX (Sitting Idle)</option>
                  <option value="Sitting Idle (1).fbx">Animated FBX (Sitting Idle 2)</option>
                </select>
              </div>
            </div>

            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSettingsModal(false)} style={{ background: 'var(--accent)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
