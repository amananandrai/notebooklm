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

  const [envTheme, setEnvTheme] = useState('lounge');
  const [avatarA, setAvatarA]   = useState('robot');
  const [avatarB, setAvatarB]   = useState('holo');
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

    // Premium Dark Theme background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle edge glow
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#23D5FF20');
    gradient.addColorStop(1, '#7C5CFF20');
    ctx.fillStyle = gradient;
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
    ctx.font = 'bold 44px "Inter", sans-serif';
    let headerY = 80;
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

    const ENV_CONFIG = {
      lounge: { // Premium AI Broadcast Studio Palette
        bg: '#0B1020', ambient: 0.8, floor: '#0B1020', tableTop: '#000000', tableApron: '#111827', seat: '#111827', frame: '#060a12',
        wall: '#0B1020', panel: '#111827', neon1: '#23D5FF', neon2: '#7C5CFF',
        key: { color: 0xfff0e6, int: 5.5 }, fill: { color: 0x9fb7ff, int: 2.0 }, rim: { color: 0xffffff, int: 2.5 }
      },
      cyber: {
        bg: '#040010', ambient: 0.8, floor: '#0a0215', tableTop: '#100a1a', tableApron: '#20103a', seat: '#1a0d30', frame: '#111111',
        wall: '#08051a', panel: '#120a2e', neon1: '#ff00ff', neon2: '#00ffff',
        key: { color: 0xff00ff, int: 6.0 }, fill: { color: 0x00ffff, int: 3.5 }, rim: { color: 0x4400ff, int: 3.0 }
      },
      broadcast: {
        bg: '#e2e8f0', ambient: 2.0, floor: '#cbd5e1', tableTop: '#f8fafc', tableApron: '#e2e8f0', seat: '#ffffff', frame: '#94a3b8',
        wall: '#f1f5f9', panel: '#ffffff', neon1: '#3b82f6', neon2: '#10b981',
        key: { color: 0xffffff, int: 4.0 }, fill: { color: 0xffffff, int: 2.0 }, rim: { color: 0xffffff, int: 1.5 }
      }
    };
    const env = ENV_CONFIG[envTheme] || ENV_CONFIG.lounge;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(env.bg);
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

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 1000); // 35mm equivalent
    camera.position.set(1.2, 1.6, 3.5);
    camera.lookAt(0, 1.2, 0);

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
    bloomPass.threshold = 1.5; // Only glow emissive elements > 1.5
    bloomPass.strength = 1.0;
    bloomPass.radius = 0.6;
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
    if (envTheme === 'cyber' || envTheme === 'lounge') {
      scene.fog = new THREE.FogExp2(env.bg, 0.035);
    }
    const ambientLight = new THREE.AmbientLight(0xffffff, env.ambient);
    scene.add(ambientLight);

    // Cinematic Key Light (Soft, 45 degrees)
    const keyLight = new THREE.SpotLight(env.key.color, env.key.int);
    keyLight.position.set(-3, 5, 4);
    keyLight.target.position.set(0, 1.2, 0);
    keyLight.angle = Math.PI / 4;
    keyLight.penumbra = 1.0;
    keyLight.decay = 1.5;
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.bias = -0.001;
    keyLight.shadow.radius = 8; // Soft shadow edges
    scene.add(keyLight, keyLight.target);

    // Cinematic Fill Light (Very soft, opposite side)
    const fillLight = new THREE.DirectionalLight(env.fill.color, env.fill.int * 0.4);
    fillLight.position.set(4, 3, 3);
    scene.add(fillLight);
    
    // Cinematic Rim Lights (Behind hosts)
    const rimLightA = new THREE.SpotLight(env.rim.color, env.rim.int);
    rimLightA.position.set(-3, 3, -3);
    rimLightA.target.position.set(-2, 1.6, 0);
    rimLightA.angle = Math.PI / 6;
    rimLightA.penumbra = 0.5;
    scene.add(rimLightA, rimLightA.target);

    const rimLightB = new THREE.SpotLight(env.rim.color, env.rim.int);
    rimLightB.position.set(3, 3, -3);
    rimLightB.target.position.set(2, 1.6, 0);
    rimLightB.angle = Math.PI / 6;
    rimLightB.penumbra = 0.5;
    scene.add(rimLightB, rimLightB.target);

    // Soft under-table light pool
    const tableLight = new THREE.SpotLight(0xffffff, 2.5);
    tableLight.position.set(0, 3, 0.5);
    tableLight.target.position.set(0, 0, 0.5);
    tableLight.angle = Math.PI / 4;
    tableLight.penumbra = 1.0;
    scene.add(tableLight, tableLight.target);

    // ── Amber Pendant Lamps (Warm Contrast) ──
    function createPendant(x, z) {
        const pendantGroup = new THREE.Group();
        pendantGroup.position.set(x, 3.5, z);
        
        // Cord
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.5), new THREE.MeshStandardMaterial({ color: '#111111' }));
        cord.position.y = 0.75;
        pendantGroup.add(cord);
        
        // Shade
        const shadeGeo = new THREE.CylinderGeometry(0.05, 0.25, 0.2, 16, 1, true);
        const shadeMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8, side: THREE.DoubleSide });
        const shade = new THREE.Mesh(shadeGeo, shadeMat);
        pendantGroup.add(shade);
        
        // Bulb
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshStandardMaterial({ emissive: '#ffaa55', emissiveIntensity: 2.0 }));
        bulb.position.y = -0.05;
        pendantGroup.add(bulb);
        
        // Light
        const pLight = new THREE.PointLight(0xffaa55, 1.0, 4.0);
        pLight.position.y = -0.1;
        pendantGroup.add(pLight);
        
        scene.add(pendantGroup);
    }
    createPendant(-1.2, 0.5);
    createPendant(1.2, 0.5);

    // ── Studio Floor ──
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({
        color: env.floor, roughness: 0.55, metalness: 0.05,
        envMapIntensity: 0.4
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.position.z = 0.4;
    floor.receiveShadow = true;
    scene.add(floor);

    // ── Dark Textured Rug ──
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 3.8),
      new THREE.MeshStandardMaterial({
        color: '#151822',
        roughness: 0.95
      })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(0, -0.07, 0.55);
    rug.receiveShadow = true;
    scene.add(rug);

    // Subtle floor line accents (runway style)
    const floorLine = new THREE.Mesh(
      new THREE.PlaneGeometry(0.02, 12),
      new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.15, transparent: true, opacity: 0.25 })
    );
    floorLine.rotation.x = -Math.PI / 2;
    floorLine.position.set(-3, -0.069, 0);
    scene.add(floorLine);
    const floorLine2 = floorLine.clone();
    floorLine2.position.set(3, -0.069, 0);
    scene.add(floorLine2);

    // ── Curved Backdrop Wall ──
    const wallGeo = new THREE.CylinderGeometry(14, 14, 10, 64, 1, true, -Math.PI, Math.PI);
    const wallMat = new THREE.MeshStandardMaterial({ color: env.wall, roughness: 0.95, side: THREE.BackSide, envMapIntensity: 0.05 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 4, 3);
    wall.receiveShadow = true;
    scene.add(wall);

    // ── Acoustic Panels (vertical architectural slats) ──
    // Left side slats
    for (let i = 0; i < 8; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 4.5, 0.15),
        new THREE.MeshStandardMaterial({ color: env.panel, roughness: 0.8, metalness: 0.1 })
      );
      slat.position.set(-3.5 - i * 0.6, 2.25, -2.5 + i * 0.15);
      slat.rotation.y = (i * 0.03);
      slat.castShadow = true;
      slat.receiveShadow = true;
      scene.add(slat);
    }
    // Right side slats
    for (let i = 0; i < 8; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 4.5, 0.15),
        new THREE.MeshStandardMaterial({ color: env.panel, roughness: 0.8, metalness: 0.1 })
      );
      slat.position.set(3.5 + i * 0.6, 2.25, -2.5 + i * 0.15);
      slat.rotation.y = -(i * 0.03);
      slat.castShadow = true;
      slat.receiveShadow = true;
      scene.add(slat);
    }

    // ── LED Neon Accents (vertical edge lighting) ──
    const neonMat1 = new THREE.MeshStandardMaterial({ color: env.neon1, emissive: env.neon1, emissiveIntensity: 1.5 });
    const neon1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 4.5, 0.04), neonMat1);
    neon1.position.set(-3.25, 2.25, -2.5);
    scene.add(neon1);
    
    const neonMat2 = new THREE.MeshStandardMaterial({ color: env.neon2, emissive: env.neon2, emissiveIntensity: 1.5 });
    const neon2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 4.5, 0.04), neonMat2);
    neon2.position.set(3.25, 2.25, -2.5);
    scene.add(neon2);

    scene.userData.neons = [neonMat1, neonMat2];

    // ── Foreground Depth Elements (blurred cinematic framing) ──
    // Soft out-of-focus leaf cluster on left (frames ESTABLISH and TWO_SHOT)
    const fgLeafMat = new THREE.MeshStandardMaterial({ color: '#1a4a2a', roughness: 0.75, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    for (let l = 0; l < 3; l++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.5 + l * 0.15, 0.9 + l * 0.1), fgLeafMat);
      leaf.position.set(-2.0 - l * 0.1, 1.2 + l * 0.1, 2.5 + l * 0.1);
      leaf.rotation.set(0.1 * l, Math.PI / 4 + l * 0.15, 0.15 + l * 0.1);
      scene.add(leaf);
    }
    // Very close out-of-focus leaf for CU_A framing
    const fgLeafCU = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.5), fgLeafMat);
    fgLeafCU.position.set(-1.8, 1.4, 0.9);
    fgLeafCU.rotation.set(0, Math.PI / 3, 0.2);
    scene.add(fgLeafCU);

    // Blurred boom arm on right
    const fgMicArmMat = new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.3, metalness: 0.85 });
    const fgMicArm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 12), fgMicArmMat);
    fgMicArm.position.set(2.0, 0.8, 2.8);
    fgMicArm.rotation.set(-Math.PI / 4.5, 0, Math.PI / 7);
    scene.add(fgMicArm);

    // ── Boutique Studio Botanical Elements ──
    function createAdvancedPlant(type, x, z) {
      const plantGroup = new THREE.Group();
      plantGroup.position.set(x, 0, z);

      // Pot geometry & material
      let potGeo, potMat;
      if (type === 'desk') {
        potGeo = new THREE.CylinderGeometry(0.08, 0.06, 0.12, 16);
        potMat = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.2, metalness: 0.1 });
      } else if (type === 'trailing') {
        potGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.3, 16);
        potMat = new THREE.MeshStandardMaterial({ color: '#2c2c2c', roughness: 0.9, metalness: 0.0 });
      } else {
        // Hero
        potGeo = new THREE.CylinderGeometry(0.35, 0.25, 0.6, 24);
        potMat = new THREE.MeshStandardMaterial({ color: '#e8e5df', roughness: 0.7, metalness: 0.0 });
      }
      
      const pot = new THREE.Mesh(potGeo, potMat);
      pot.position.y = potGeo.parameters.height / 2;
      pot.castShadow = true;
      plantGroup.add(pot);

      // Soil
      const soil = new THREE.Mesh(
        new THREE.CircleGeometry(potGeo.parameters.radiusTop * 0.9, 16),
        new THREE.MeshStandardMaterial({ color: '#1a120c', roughness: 1.0 })
      );
      soil.rotation.x = -Math.PI / 2;
      soil.position.y = potGeo.parameters.height - 0.01;
      plantGroup.add(soil);

      // Leaf Colors
      const leafColors = ['#2e472d', '#3a5a39', '#446842', '#213320', '#4a6b48'];
      
      if (type === 'hero') {
        // Large Monstera/Bird of Paradise style
        const stemMat = new THREE.MeshStandardMaterial({ color: '#446842', roughness: 0.7 });
        for (let i = 0; i < 5; i++) {
            const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, 1.5 + Math.random()*0.8, 8), stemMat);
            const angle = (i / 5) * Math.PI * 2;
            stem.rotation.set((Math.random() - 0.5)*0.4, angle, 0.1 + Math.random()*0.2);
            stem.position.y = potGeo.parameters.height + stem.geometry.parameters.height/2 - 0.2;
            plantGroup.add(stem);
        }
        
        // Curved Elongated Leaves
        const leafGeo = new THREE.PlaneGeometry(0.35, 0.8, 4, 4);
        const pos = leafGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
           const vx = pos.getX(i);
           const vy = pos.getY(i);
           pos.setZ(i, -Math.pow(vx*2, 2) * 0.1 + (vy*0.1));
        }
        leafGeo.computeVertexNormals();

        for (let i = 0; i < 22; i++) {
          const leafMat = new THREE.MeshStandardMaterial({
            color: leafColors[i % leafColors.length],
            roughness: 0.4, side: THREE.DoubleSide, metalness: 0.1
          });
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.5;
          const h = potGeo.parameters.height + 0.4 + (i * 0.08) + Math.random() * 0.5;
          const r = 0.1 + Math.random() * 0.3;
          
          const scale = 0.6 + Math.random() * 0.8;
          leaf.scale.setScalar(scale);
          
          leaf.position.set(Math.cos(angle) * r, h, Math.sin(angle) * r);
          leaf.rotation.set(
            (Math.random() - 0.5) * 1.2,
            angle + Math.PI / 2,
            -0.2 - Math.random() * 0.6
          );
          leaf.castShadow = true;
          plantGroup.add(leaf);
        }
      } else if (type === 'trailing') {
        // Pothos style
        const leafGeo = new THREE.PlaneGeometry(0.12, 0.16, 2, 2);
        for (let i = 0; i < 35; i++) {
          const leafMat = new THREE.MeshStandardMaterial({
            color: leafColors[i % leafColors.length],
            roughness: 0.35, side: THREE.DoubleSide
          });
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          // Trail downwards
          const trailId = i % 5;
          const drop = Math.random() * 0.8;
          const angle = (trailId / 5) * Math.PI * 2;
          const r = potGeo.parameters.radiusTop + 0.05 + Math.random() * 0.05;
          leaf.position.set(
             Math.cos(angle) * r + (Math.random()-0.5)*0.1, 
             potGeo.parameters.height + 0.1 - drop, 
             Math.sin(angle) * r + (Math.random()-0.5)*0.1
          );
          leaf.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
          leaf.castShadow = true;
          plantGroup.add(leaf);
        }
      } else if (type === 'desk') {
        // Small Succulent
        const leafGeo = new THREE.BoxGeometry(0.04, 0.1, 0.02);
        for (let i = 0; i < 12; i++) {
          const leafMat = new THREE.MeshStandardMaterial({ color: '#557a55', roughness: 0.5 });
          const leaf = new THREE.Mesh(leafGeo, leafMat);
          const angle = (i / 12) * Math.PI * 2;
          leaf.position.set(Math.cos(angle)*0.03, potGeo.parameters.height + 0.04, Math.sin(angle)*0.03);
          leaf.rotation.set(-0.5, angle, 0);
          leaf.castShadow = true;
          plantGroup.add(leaf);
        }
      }

      scene.add(plantGroup);
      return plantGroup;
    }

    // Spawn studio plants
    const plantA = createAdvancedPlant('hero', -3.2, -0.8);
    const plantB = createAdvancedPlant('trailing', 3.3, -1.5);
    scene.userData.plants = [plantA, plantB];

    // Plant Spotlight (Soft green fill)
    const plantLightA = new THREE.SpotLight(0x8fd694, 2.5);
    plantLightA.position.set(-4, 3.5, 1);
    plantLightA.target.position.set(-3.2, 1.2, -0.8);
    plantLightA.angle = Math.PI / 4;
    plantLightA.penumbra = 1;
    scene.add(plantLightA, plantLightA.target);

    const plantLightB = new THREE.SpotLight(0x8fd694, 1.5);
    plantLightB.position.set(4, 3.5, 1);
    plantLightB.target.position.set(3.3, 1.0, -1.5);
    plantLightB.angle = Math.PI / 4;
    plantLightB.penumbra = 1;
    scene.add(plantLightB, plantLightB.target);

    // ── Shelving System ──
    function createShelf(x, z, isLeft) {
       const shelfGroup = new THREE.Group();
       shelfGroup.position.set(x, 0, z);
       
       const woodMat = new THREE.MeshStandardMaterial({ color: '#1a110a', roughness: 0.8, metalness: 0.1 });
       const metalMat = new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.3, metalness: 0.8 });
       
       // Uprights
       const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.5, 0.04), metalMat);
       post1.position.set(-0.5, 1.25, 0);
       const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 2.5, 0.04), metalMat);
       post2.position.set(0.5, 1.25, 0);
       shelfGroup.add(post1, post2);

       // Shelves
       const heights = [0.4, 1.0, 1.6, 2.2];
       heights.forEach(h => {
           const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.3), woodMat);
           board.position.set(0, h, 0);
           board.castShadow = true;
           board.receiveShadow = true;
           shelfGroup.add(board);
       });

       const bookColors = ['#1e293b', '#334155', '#475569', '#0f172a', '#7c5cff', '#0284c7'];
       
       const spawnBooks = (hx, hy, count) => {
           let ox = hx;
           for(let i=0; i<count; i++) {
               const bw = 0.03 + Math.random() * 0.02;
               const bh = 0.15 + Math.random() * 0.05;
               const bd = 0.18 + Math.random() * 0.02;
               
               const bGeo = new THREE.BoxGeometry(bw, bh, bd);
               const bMat = new THREE.MeshStandardMaterial({ color: bookColors[Math.floor(Math.random()*bookColors.length)], roughness: 0.8 });
               
               const book = new THREE.Mesh(bGeo, bMat);
               book.position.set(ox, hy + bh/2 + 0.02, 0);
               book.rotation.y = (Math.random()-0.5)*0.1;
               book.rotation.z = (Math.random() > 0.8) ? (Math.random()-0.5)*0.2 : 0; // leaning
               book.castShadow = true;
               shelfGroup.add(book);
               ox += bw + 0.005;
           }
       };

       if (isLeft) {
           spawnBooks(-0.3, 1.0, 6);
           spawnBooks(0.1, 1.6, 4);
           // Warm practical lamp
           const lampGeo = new THREE.SphereGeometry(0.08, 16, 16);
           const lampMat = new THREE.MeshStandardMaterial({ emissive: '#ffaa55', emissiveIntensity: 2.0, color: '#ffffff' });
           const lamp = new THREE.Mesh(lampGeo, lampMat);
           lamp.position.set(0.3, 1.1, 0);
           shelfGroup.add(lamp);
           const lampLight = new THREE.PointLight(0xffaa55, 0.5, 2.0);
           lampLight.position.set(0.3, 1.1, 0);
           shelfGroup.add(lampLight);
           
           // Small Globe
           const globeGeo = new THREE.SphereGeometry(0.1, 16, 16);
           const globeMat = new THREE.MeshStandardMaterial({ color: '#23D5FF', roughness: 0.2, metalness: 0.8, wireframe: true });
           const globe = new THREE.Mesh(globeGeo, globeMat);
           globe.position.set(-0.3, 2.32, 0);
           shelfGroup.add(globe);
       } else {
           spawnBooks(-0.4, 0.4, 8);
           spawnBooks(0.2, 2.2, 5);
           // Abstract metallic sculpture
           const sculptGeo = new THREE.TorusKnotGeometry(0.08, 0.02, 64, 8);
           const sculptMat = new THREE.MeshStandardMaterial({ color: '#ffb84d', roughness: 0.1, metalness: 0.9 });
           const sculpt = new THREE.Mesh(sculptGeo, sculptMat);
           sculpt.position.set(-0.2, 1.7, 0);
           sculpt.castShadow = true;
           shelfGroup.add(sculpt);
           
           // Trailing plant on shelf
           const trailing = createAdvancedPlant('trailing', 0, 0);
           trailing.position.set(0.3, 1.0, 0);
           trailing.scale.set(0.6, 0.6, 0.6);
           shelfGroup.add(trailing);
           
           // Small glowing object
           const glowObj = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), new THREE.MeshStandardMaterial({ emissive: '#7C5CFF', emissiveIntensity: 2.0 }));
           glowObj.position.set(-0.3, 1.06, 0);
           shelfGroup.add(glowObj);
           const glowLight = new THREE.PointLight(0x7C5CFF, 0.5, 2.0);
           glowLight.position.set(-0.3, 1.06, 0);
           shelfGroup.add(glowLight);
       }
       
       scene.add(shelfGroup);
    }
    
    createShelf(-3.5, -3.0, true);
    createShelf(3.5, -3.0, false);

    // 3. Studio Furniture
    const gltfLoader = new GLTFLoader();
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);
    const fbxLoader = new FBXLoader();

    // Load table asset
    gltfLoader.load('/table.glb', (gltf) => {
      const tableModel = gltf.scene;
      tableModel.position.set(0, -0.08, 0.55);
      tableModel.scale.set(1.1, 0.85, 1.0);
      tableModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Upgrade materials to dark glass / matte black frame
          if (child.material) {
            if (child.material.name.toLowerCase().includes('glass') || child.material.name.toLowerCase().includes('top')) {
               child.material = new THREE.MeshStandardMaterial({ color: '#0a0d14', roughness: 0.15, metalness: 0.8, envMapIntensity: 1.0 });
            } else {
               child.material = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.8, metalness: 0.3 });
            }
          }
        }
      });
      scene.add(tableModel);
    }, undefined, (err) => {
      console.error("Error loading table GLB:", err);
    });

    const standMat = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.35, metalness: 0.7 });

    // ── Modern Studio Armchairs ──
    function createChair(x, accent) {
        const chair = new THREE.Group();
        chair.position.set(x, 0, 0.55);

        const leatherMat = new THREE.MeshStandardMaterial({ color: env.seat, roughness: 0.65, metalness: 0.0, envMapIntensity: 0.3 });
        const frameMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.25, metalness: 0.8 });
        const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45, metalness: 0.2, emissive: accent, emissiveIntensity: 0.05 });

        // Seat cushion
        const seatGeo = new THREE.BoxGeometry(0.55, 0.1, 0.52, 2, 2, 2);
        seatGeo.translate(0, 0, 0);
        const seat = new THREE.Mesh(seatGeo, leatherMat);
        seat.position.set(0, 0.45, 0);
        seat.castShadow = true;
        chair.add(seat);

        // Back cushion
        const backGeo = new THREE.BoxGeometry(0.55, 0.75, 0.08, 2, 4, 1);
        const back = new THREE.Mesh(backGeo, leatherMat);
        back.position.set(0, 0.85, -0.22);
        back.rotation.x = 0.1;
        back.castShadow = true;
        chair.add(back);

        // Headrest
        const headrest = new THREE.Mesh(
          new THREE.BoxGeometry(0.35, 0.15, 0.08, 2, 2, 1),
          leatherMat
        );
        headrest.position.set(0, 1.28, -0.26);
        headrest.castShadow = true;
        chair.add(headrest);

        // Metal frame
        const backSupport = new THREE.Mesh(
          new THREE.BoxGeometry(0.03, 0.9, 0.03),
          frameMat
        );
        backSupport.position.set(0, 0.85, -0.28);
        chair.add(backSupport);

        // Armrests
        [-0.3, 0.3].forEach((armX) => {
          const armPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 8), frameMat);
          armPost.position.set(armX, 0.58, 0.05);
          chair.add(armPost);
          const armPad = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.28), accentMat);
          armPad.position.set(armX, 0.7, -0.02);
          chair.add(armPad);
        });

        // Legs
        const legPositions = [[-0.24, 0.2], [0.24, 0.2], [-0.24, -0.2], [0.24, -0.2]];
        legPositions.forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), frameMat);
          leg.position.set(lx, 0.225, lz);
          chair.add(leg);
          const foot = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 4), frameMat);
          foot.position.set(lx, 0.0, lz);
          chair.add(foot);
        });

        // Accent strip on back
        const accentStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.04, 0.6, 0.1),
          accentMat
        );
        accentStrip.position.set(0, 0.85, -0.26);
        chair.add(accentStrip);

        scene.add(chair);
    }

    createChair(-1.55, '#7c6cf6');
    createChair(1.55, '#ec4899');

    // ── Table Decor ──
    const tableDecorGroup = new THREE.Group();
    tableDecorGroup.position.set(0, 0.73, 0.55); // Table surface height

    // Central small plant
    const deskPlant = createAdvancedPlant('desk', 0, 0);
    deskPlant.position.set(0, 0, 0.1);
    tableDecorGroup.add(deskPlant);

    // Mugs
    const mugGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.09, 16);
    const mugMat = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.1 });
    const handleGeo = new THREE.TorusGeometry(0.025, 0.008, 8, 12);
    
    const mugA = new THREE.Mesh(mugGeo, mugMat);
    mugA.position.set(-0.35, 0.045, -0.05);
    mugA.castShadow = true;
    const handleA = new THREE.Mesh(handleGeo, mugMat);
    handleA.position.set(0.04, 0, 0);
    handleA.rotation.y = Math.PI/4;
    mugA.add(handleA);
    tableDecorGroup.add(mugA);

    const mugB = new THREE.Mesh(mugGeo, mugMat);
    mugB.position.set(0.35, 0.045, -0.05);
    mugB.castShadow = true;
    const handleB = new THREE.Mesh(handleGeo, mugMat);
    handleB.position.set(-0.04, 0, 0);
    handleB.rotation.y = -Math.PI/4;
    mugB.add(handleB);
    tableDecorGroup.add(mugB);

    // Stacked books on table
    const tableBookColors = ['#0f172a', '#7c5cff'];
    let tbY = 0.02;
    tableBookColors.forEach((color, i) => {
        const tbGeo = new THREE.BoxGeometry(0.25, 0.03, 0.18);
        const tbMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 });
        const tb = new THREE.Mesh(tbGeo, tbMat);
        tb.position.set(-0.25, tbY, 0.2);
        tb.rotation.y = 0.1 + (i * 0.15);
        tb.castShadow = true;
        tableDecorGroup.add(tb);
        tbY += 0.032;
    });

    scene.add(tableDecorGroup);

    // ── Neon Sign (AI / HUMAN / TRUST) ──
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512; signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#000000'; // black bg (transparent in material)
    sctx.fillRect(0,0,512,128);
    sctx.fillStyle = '#23D5FF';
    sctx.font = 'bold 36px "Inter", sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('AI / HUMAN / TRUST', 256, 64);
    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshStandardMaterial({ 
        map: signTex, 
        emissiveMap: signTex,
        emissive: '#23D5FF',
        emissiveIntensity: 3.5,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), signMat);
    signMesh.position.set(-4.5, 2.5, -0.5);
    signMesh.rotation.y = Math.PI / 3;
    scene.add(signMesh);
    
    // Slight glow from sign
    const signLight = new THREE.PointLight(0x23D5FF, 0.5, 3.0);
    signLight.position.set(-4.2, 2.5, -0.5);
    scene.add(signLight);

    // ── Broadcast Condenser Microphones with Boom Arms ──
    function createMic(x, z, rotY) {
      const group = new THREE.Group();
      group.position.set(x, 0.72, z); // Table surface height
      group.rotation.y = rotY;

      const darkMetal = new THREE.MeshStandardMaterial({ color: '#0B1020', roughness: 0.4, metalness: 0.6 });
      const brushedMetal = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.3, metalness: 0.8 });
      const grillMat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.25, metalness: 0.6 });

      // Desk clamp
      const clamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), darkMetal);
      clamp.position.set(0, -0.02, 0.4); // clamped at the back edge of desk
      group.add(clamp);

      // Lower boom arm
      const lowerArm = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.4, 0.025), darkMetal);
      lowerArm.position.set(0, 0.15, 0.3);
      lowerArm.rotation.x = Math.PI / 4;
      group.add(lowerArm);
      
      // Upper boom arm
      const upperArm = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.02), darkMetal);
      upperArm.position.set(0, 0.35, 0.05);
      upperArm.rotation.x = -Math.PI / 6;
      group.add(upperArm);

      // Mic Mount joint
      const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.04), brushedMetal);
      joint.rotation.z = Math.PI / 2;
      joint.position.set(0, 0.48, -0.05);
      group.add(joint);

      // Shock mount ring
      const shockMount = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.008, 8, 24), darkMetal);
      shockMount.position.set(0, 0.45, -0.15);
      shockMount.rotation.x = Math.PI / 2;
      group.add(shockMount);

      // Mic body
      const micBody = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16), darkMetal);
      micBody.position.set(0, 0.45, -0.15);
      group.add(micBody);

      // Mic grille
      const grille = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.048, 0.06, 16), grillMat);
      grille.position.set(0, 0.56, -0.15);
      group.add(grille);

      // Grille top cap
      const grilleCap = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), grillMat);
      grilleCap.position.set(0, 0.59, -0.15);
      group.add(grilleCap);

      // LED activity ring
      const ledRing = new THREE.Mesh(
         new THREE.TorusGeometry(0.048, 0.005, 6, 24), 
         new THREE.MeshStandardMaterial({ color: '#23D5FF', emissive: '#23D5FF', emissiveIntensity: 0 })
      );
      ledRing.position.set(0, 0.525, -0.15);
      ledRing.rotation.x = Math.PI / 2;
      group.add(ledRing);

      scene.add(group);
      return ledRing.material;
    }
    const micMatA = createMic(-0.6, 0.55, -Math.PI / 10);
    const micMatB = createMic(0.6, 0.55, Math.PI / 10);
    scene.userData.mics = { a: micMatA, b: micMatB };

    // 4. LED Display Wall
    const boardCanvas = canvasRef.current;
    const boardTexture = new THREE.CanvasTexture(boardCanvas);
    boardTextureRef.current = boardTexture;

    const boardGeo = new THREE.BoxGeometry(6.4, 3.2, 0.1);
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture, roughness: 0.2, metalness: 0.5, emissiveMap: boardTexture, emissive: '#ffffff', emissiveIntensity: 0.4 });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 2.2, -2.2);
    scene.add(board);

    // Dark thin metal bezel
    const frameGeo = new THREE.BoxGeometry(6.5, 3.3, 0.08);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#0B1020', roughness: 0.5, metalness: 0.8 });
    const boardFrame = new THREE.Mesh(frameGeo, frameMat);
    boardFrame.position.set(0, 2.2, -2.25);
    scene.add(boardFrame);

    // Captions for exported video: this plane is part of the WebGL canvas
    const captionCanvas = document.createElement('canvas');
    captionCanvas.width = 800;
    captionCanvas.height = 120;
    captionCanvasRef.current = captionCanvas;
    const captionTexture = new THREE.CanvasTexture(captionCanvas);
    captionTextureRef.current = captionTexture;
    const captionMaterial = new THREE.MeshBasicMaterial({
      map: captionTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const captionMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 0.6), captionMaterial);
    captionMesh.position.set(0, 0.25, 2.85);
    captionMesh.renderOrder = 100;
    captionMesh.visible = false;
    captionMeshRef.current = captionMesh;
    scene.add(captionMesh);
    updateCaptionOverlayRef.current();

    // Load High-Resolution 3D Host Avatars from public folder GLBs.
    // The source files are authored at a tiny scale, so fit them to the
    // studio after loading instead of relying on their exported transforms.
    function prepareHostModel(model, x, z, rotationY, animations = []) {
      model.updateMatrixWorld(true);
      const sourceBounds = new THREE.Box3().setFromObject(model);
      const sourceSize = sourceBounds.getSize(new THREE.Vector3());
      const targetHeight = 1.55; // Fit to chair height
      if (sourceSize.y > 0) {
        model.scale.multiplyScalar(targetHeight / sourceSize.y);
      }

      model.updateMatrixWorld(true);
      const fittedBounds = new THREE.Box3().setFromObject(model);
      // Determine base position so the butt/legs rest on the chair seat (~0.25).
      const basePosition = 0.25 - fittedBounds.min.y;

      model.position.set(x, basePosition, z);
      model.rotation.y = rotationY;

      model.userData = { 
        basePosition, 
        baseRotationY: rotationY,
        bones: { spine: null, neck: null, head: null }
      };

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
             // Subsurface scattering & roughness approximation
             const matName = child.material.name.toLowerCase();
             if (matName.includes('skin') || matName.includes('head') || matName.includes('body')) {
                 child.material.roughness = 0.45;
                 child.material.metalness = 0.05;
                 if (child.material.color) {
                     child.material.color.lerp(new THREE.Color(0xffe0cd), 0.15); // Warm skin tint
                 }
             } else {
                 // Clothing fabric roughness
                 child.material.roughness = 0.85;
             }
          }
        }
        if (child.isBone) {
           const name = child.name.toLowerCase();
           if (name.includes('spine') && !model.userData.bones.spine) {
               model.userData.bones.spine = child;
               model.userData.baseSpineY = child.position.y;
           }
           if (name.includes('neck') && !model.userData.bones.neck) model.userData.bones.neck = child;
           if (name.includes('head') && !model.userData.bones.head) model.userData.bones.head = child;
        }
      });
      scene.add(model);

      // Initialize AnimationMixer if the GLB contains baked animations
      if (animations && animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        model.userData.mixer = mixer;
        model.userData.actions = {};
        
        animations.forEach(clip => {
            const action = mixer.clipAction(clip);
            const lower = clip.name.toLowerCase();
            if (lower.includes('sit') || lower.includes('idle')) model.userData.actions.idle = action;
            else if (lower.includes('talk') || lower.includes('speak')) model.userData.actions.talk = action;
            else if (lower.includes('listen') || lower.includes('agree')) model.userData.actions.listen = action;
            else if (lower.includes('gesture') || lower.includes('explain')) model.userData.actions.gesture = action;
        });

        // Fallbacks if specific clips don't exist
        if (!model.userData.actions.idle) model.userData.actions.idle = mixer.clipAction(animations[0]);
        if (!model.userData.actions.talk) model.userData.actions.talk = model.userData.actions.idle;
        if (!model.userData.actions.listen) model.userData.actions.listen = model.userData.actions.idle;

        model.userData.activeAction = model.userData.actions.idle;
        model.userData.activeAction.play();
        mixersRef.current.push(mixer);
      }
    }

    function createProceduralAvatar(type, x, z, rotationY) {
      const group = new THREE.Group();
      group.position.set(x, 0.25, z); // On chair seat
      group.rotation.y = rotationY;

      let headColor, bodyColor, isHolo = false;
      if (type === 'robot') {
        headColor = 0xe2e8f0;
        bodyColor = 0x94a3b8;
      } else if (type === 'holo') {
        headColor = 0x38bdf8;
        bodyColor = 0x0ea5e9;
        isHolo = true;
      }

      const matOpts = isHolo 
        ? { color: headColor, transparent: true, opacity: 0.6, emissive: headColor, emissiveIntensity: 0.5, wireframe: isHolo }
        : { color: headColor, roughness: 0.2, metalness: 0.8 };
      
      const headMat = new THREE.MeshStandardMaterial(matOpts);
      const bodyMat = new THREE.MeshStandardMaterial({ ...matOpts, color: bodyColor });

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.25), headMat);
      head.position.y = 1.0;
      if (!isHolo) head.castShadow = true;
      group.add(head);

      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.6), bodyMat);
      body.position.y = 0.5;
      if (!isHolo) body.castShadow = true;
      group.add(body);

      group.userData = { basePosition: 0.5, baseRotationY: rotationY };
      scene.add(group);
      return group;
    }

    function loadAvatar(type, hostRef, x, z, rotationY) {
      if (type.endsWith('.glb')) {
        gltfLoader.load(`/${type}`, (gltf) => {
          const model = gltf.scene;
          prepareHostModel(model, x, z, rotationY, gltf.animations);
          hostRef.current = model;
        }, undefined, (err) => console.error(`Error loading ${type} GLB:`, err));
      } else if (type.endsWith('.fbx')) {
        fbxLoader.load(`/${type}`, (fbx) => {
          // FBX models often have a different scale or hierarchy, but we can process them similarly
          // FBX animations are stored directly on the loaded object
          prepareHostModel(fbx, x, z, rotationY, fbx.animations);
          hostRef.current = fbx;
        }, undefined, (err) => console.error(`Error loading ${type} FBX:`, err));
      } else {
        hostRef.current = createProceduralAvatar(type, x, z, rotationY);
      }
    }

    loadAvatar(avatarA, hostARef, -1.55, 0.55, Math.PI / 6);
    loadAvatar(avatarB, hostBRef, 1.55, 0.55, -Math.PI / 6);

    // Initial chalkboard render
    updateBlackboardTextureRef.current();

    // ── Animation Frame Loop ─────────────────────────────────────
    let lastTime = performance.now();
    let startTime = lastTime;

    const CAM_TARGETS = {
      ESTABLISH: { pos: new THREE.Vector3(1.2, 1.5, 3.2), look: new THREE.Vector3(0, 1.25, 0) },
      TWO_SHOT: { pos: new THREE.Vector3(0, 1.35, 2.2), look: new THREE.Vector3(0, 1.25, 0) },
      CU_A: { pos: new THREE.Vector3(-1.55, 1.45, 1.1), look: new THREE.Vector3(-1.55, 1.35, 0) },
      CU_B: { pos: new THREE.Vector3(1.55, 1.45, 1.1), look: new THREE.Vector3(1.55, 1.35, 0) },
      OTS_A: { pos: new THREE.Vector3(1.2, 1.4, 0.8), look: new THREE.Vector3(-1.55, 1.35, 0) },
      OTS_B: { pos: new THREE.Vector3(-1.2, 1.4, 0.8), look: new THREE.Vector3(1.55, 1.35, 0) },
      REACTION_A: { pos: new THREE.Vector3(-1.6, 1.40, 1.3), look: new THREE.Vector3(-1.55, 1.35, 0) },
      REACTION_B: { pos: new THREE.Vector3(1.6, 1.40, 1.3), look: new THREE.Vector3(1.55, 1.35, 0) },
      BOARD: { pos: new THREE.Vector3(0, 1.8, 3.5), look: new THREE.Vector3(0, 2.2, -2.2) }
    };
    camera.userData.targetLook = new THREE.Vector3(0, 1.2, 0);

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
      if (scene.userData.neons) {
        const baseIntensity = envTheme === 'cyber' ? 3.5 : 2.0;
        const pulse = Math.sin(time * 2.0) * 0.3;
        scene.userData.neons.forEach(mat => mat.emissiveIntensity = baseIntensity + pulse);
      }

      if (scene.userData.plants) {
         scene.userData.plants.forEach((plant, i) => {
            plant.rotation.y = Math.sin(time * 0.5 + i) * 0.05;
            plant.rotation.z = Math.sin(time * 0.3 + i) * 0.02;
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
                 host.userData.bones.spine.position.y = host.userData.baseSpineY + breath;
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
      captionMaterial.dispose();
      captionMesh.geometry.dispose();
      captionCanvasRef.current = null;
      captionTextureRef.current = null;
      captionMeshRef.current = null;
    };
  }, [envTheme, avatarA, avatarB]); // Re-initialize scene if these change

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
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Environment</label>
                <select value={envTheme} onChange={e => setEnvTheme(e.target.value)} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <option value="lounge">Late Night Lounge</option>
                  <option value="cyber">Cyber Studio</option>
                  <option value="broadcast">Bright Broadcast</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Host A (Left)</label>
                <select value={avatarA} onChange={e => setAvatarA(e.target.value)} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <option value="robot">Robot (Procedural)</option>
                  <option value="holo">Holo AI (Procedural)</option>
                  <option value="male.glb">Ready Player Me (Male)</option>
                  <option value="female.glb">Ready Player Me (Female)</option>
                  <option value="Sitting Idle.fbx">Animated FBX (Sitting Idle)</option>
                  <option value="Sitting Idle (1).fbx">Animated FBX (Sitting Idle 2)</option>
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>Host B (Right)</label>
                <select value={avatarB} onChange={e => setAvatarB(e.target.value)} style={{ fontSize: 13, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
                  <option value="holo">Holo AI (Procedural)</option>
                  <option value="robot">Robot (Procedural)</option>
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
