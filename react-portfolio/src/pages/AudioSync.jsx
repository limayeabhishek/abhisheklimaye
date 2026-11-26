import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Radio,
  Copy,
  Check,
  Users,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Laptop,
  Mic,
  Tv,
  LogOut,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

const YOUTUBE_CONTAINER_ID = 'audiosync-yt-player';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `SYNC-${suffix}`;
}

function generatePeerId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `peer-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function extractYouTubeVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com'
    ) {
      const vParam = url.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      if (
        parts.length >= 2 &&
        ['shorts', 'embed', 'live', 'v'].includes(parts[0]) &&
        /^[a-zA-Z0-9_-]{11}$/.test(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

function mungeOpusSdp(sdp) {
  if (!sdp) return sdp;
  const lines = sdp.split('\r\n');
  let opusPayload = null;

  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPayload = match[1];
      break;
    }
  }

  if (!opusPayload) return sdp;

  const fmtpPrefix = `a=fmtp:${opusPayload} `;
  let foundFmtp = false;

  const updated = lines.map((line) => {
    if (!line.startsWith(fmtpPrefix)) return line;
    foundFmtp = true;
    const params = line
      .slice(fmtpPrefix.length)
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);

    const paramMap = new Map();
    for (const param of params) {
      const [k, v] = param.split('=');
      if (k) paramMap.set(k.trim(), v !== undefined ? v.trim() : '');
    }

    paramMap.set('stereo', '1');
    paramMap.set('sprop-stereo', '1');
    paramMap.set('maxaveragebitrate', '128000');

    const rebuilt = Array.from(paramMap.entries())
      .map(([k, v]) => (v !== '' ? `${k}=${v}` : k))
      .join(';');

    return `${fmtpPrefix}${rebuilt}`;
  });

  if (!foundFmtp) {
    const rtpmapIdx = updated.findIndex((l) => l.startsWith(`a=rtpmap:${opusPayload} `));
    if (rtpmapIdx !== -1) {
      updated.splice(
        rtpmapIdx + 1,
        0,
        `a=fmtp:${opusPayload} minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000`
      );
    }
  }

  return updated.join('\r\n');
}

let ytApiPromise = null;
function loadYouTubeIframeAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousCallback === 'function') {
        try {
          previousCallback();
        } catch {
          // Ignore prior handler errors
        }
      }
      resolve(window.YT);
    };

    const existingScript = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );
    if (!existingScript) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      tag.onerror = () => {
        ytApiPromise = null;
        reject(new Error('Failed to load YouTube IFrame API.'));
      };
      document.head.appendChild(tag);
    }
  });

  return ytApiPromise;
}

const AudioSync = () => {
  const { profile, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRoom = (searchParams.get('room') || '').trim().toUpperCase();

  const [peerId] = useState(() => generatePeerId());
  const displayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Operator';

  // Lobby / Room state
  const [roomInput, setRoomInput] = useState(urlRoom);
  const [activeRoom, setActiveRoom] = useState('');
  const [role, setRole] = useState(null); // 'host' | 'listener'
  const [mode, setMode] = useState('youtube'); // 'youtube' | 'system' | 'mic'
  const [needsSpeakerTap, setNeedsSpeakerTap] = useState(Boolean(urlRoom));
  const [copiedLink, setCopiedLink] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [presenceList, setPresenceList] = useState([]);
  const [wakeLockActive, setWakeLockActive] = useState(false);

  // YouTube Sync state
  const [ytInput, setYtInput] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [nudgeOffsetMs, setNudgeOffsetMs] = useState(0);
  const [adBreakActive, setAdBreakActive] = useState(false);
  const [ytReady, setYtReady] = useState(false);

  // WebRTC Audio Streaming state
  const [localStreamActive, setLocalStreamActive] = useState(false);
  const [remoteAudioActive, setRemoteAudioActive] = useState(false);
  const [webrtcDelayMs, setWebrtcDelayMs] = useState(0);
  const [listenerMuted, setListenerMuted] = useState(false);

  // Refs for strict lifecycle & cleanup
  const channelRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const wakeLockRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const remoteStreamsRef = useRef(new Map());
  const delayNodeRef = useRef(null);
  const gainNodeRef = useRef(null);
  const remoteAudioElRef = useRef(null);

  const heartbeatIntervalRef = useRef(null);
  const adCheckIntervalRef = useRef(null);
  const scheduledActionTimeoutRef = useRef(null);
  const clockOffsetMsRef = useRef(0);
  const latestSyncRef = useRef(null);
  const prevPlayerTimeRef = useRef(null);
  const freezeTicksRef = useRef(0);
  const adBreakRef = useRef(false);
  const nudgeOffsetMsRef = useRef(0);
  const activeRoomRef = useRef('');
  const roleRef = useRef(null);
  const modeRef = useRef('youtube');
  const videoIdRef = useRef('');
  const isPlayingRef = useRef(false);

  useEffect(() => {
    nudgeOffsetMsRef.current = nudgeOffsetMs;
  }, [nudgeOffsetMs]);

  useEffect(() => {
    activeRoomRef.current = activeRoom;
  }, [activeRoom]);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const getServerNow = useCallback(() => Date.now() + clockOffsetMsRef.current, []);

  // AudioContext unlock
  const ensureAudioContext = useCallback(async () => {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }

    // Play a 1-sample silent buffer to unlock iOS Safari / Android Chrome audio
    try {
      const buffer = audioCtxRef.current.createBuffer(1, 1, 22050);
      const source = audioCtxRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtxRef.current.destination);
      source.start(0);
    } catch {
      // Ignore unlock errors
    }

    return audioCtxRef.current;
  }, []);

  // Wake Lock acquisition & visibilitychange re-acquire
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      setWakeLockActive(false);
      return;
    }
    try {
      if (wakeLockRef.current) {
        await wakeLockRef.current.release().catch(() => {});
      }
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener('release', () => {
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeRoomRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestWakeLock]);

  const updatePresenceStatus = useCallback(
    async (statusText) => {
      if (!channelRef.current) return;
      try {
        await channelRef.current.track({
          peerId,
          displayName,
          role: roleRef.current || 'listener',
          status: statusText,
          joinedAt: Date.now(),
        });
      } catch {
        // Ignore presence update errors if channel closing
      }
    },
    [displayName, peerId]
  );

  // Stop local WebRTC media stream
  const stopLocalMedia = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }
    setLocalStreamActive(false);
  }, []);

  const closeAllPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.ontrack = null;
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {
        // Ignore close errors
      }
    });
    peerConnectionsRef.current.clear();

    remoteStreamsRef.current.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });
    remoteStreamsRef.current.clear();

    if (remoteAudioElRef.current) {
      remoteAudioElRef.current.srcObject = null;
    }
    setRemoteAudioActive(false);
  }, []);

  // Strict comprehensive cleanup
  const cleanupRoomResources = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (adCheckIntervalRef.current) {
      clearInterval(adCheckIntervalRef.current);
      adCheckIntervalRef.current = null;
    }
    if (scheduledActionTimeoutRef.current) {
      clearTimeout(scheduledActionTimeoutRef.current);
      scheduledActionTimeoutRef.current = null;
    }

    if (channelRef.current) {
      try {
        channelRef.current.send({
          type: 'broadcast',
          event: 'peer-leave',
          payload: { peerId },
        });
      } catch {
        // Ignore
      }
      if (supabase) {
        supabase.removeChannel(channelRef.current).catch(() => {});
      }
      channelRef.current = null;
    }

    closeAllPeerConnections();
    stopLocalMedia();

    if (ytPlayerRef.current) {
      try {
        ytPlayerRef.current.destroy();
      } catch {
        // Ignore destroy errors
      }
      ytPlayerRef.current = null;
    }
    setYtReady(false);

    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
    }
    audioCtxRef.current = null;
    delayNodeRef.current = null;
    gainNodeRef.current = null;

    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);

    latestSyncRef.current = null;
    prevPlayerTimeRef.current = null;
    freezeTicksRef.current = 0;
    adBreakRef.current = false;
    setAdBreakActive(false);
    setPresenceList([]);
  }, [closeAllPeerConnections, peerId, stopLocalMedia]);

  useEffect(() => {
    return () => {
      cleanupRoomResources();
    };
  }, [cleanupRoomResources]);

  // Attach remote WebRTC audio stream through Web Audio DelayNode + muted <audio> element
  const attachRemoteAudioStream = useCallback(
    async (stream, fromPeerId) => {
      remoteStreamsRef.current.set(fromPeerId, stream);
      setRemoteAudioActive(true);

      // Attach to muted <audio> element for Chrome WebRTC-to-WebAudio compatibility
      if (remoteAudioElRef.current) {
        remoteAudioElRef.current.srcObject = stream;
        remoteAudioElRef.current.muted = true;
        remoteAudioElRef.current.play().catch(() => {});
      }

      const ctx = await ensureAudioContext();
      if (!ctx) return;

      try {
        const source = ctx.createMediaStreamSource(stream);
        const delayNode = ctx.createDelay(1.0);
        delayNode.delayTime.setValueAtTime(webrtcDelayMs / 1000, ctx.currentTime);
        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(listenerMuted ? 0 : 1, ctx.currentTime);

        source.connect(delayNode);
        delayNode.connect(gainNode);
        gainNode.connect(ctx.destination);

        delayNodeRef.current = delayNode;
        gainNodeRef.current = gainNode;
        updatePresenceStatus('Synced');
      } catch (err) {
        console.error('Web Audio DelayNode routing error:', err);
      }
    },
    [ensureAudioContext, listenerMuted, updatePresenceStatus, webrtcDelayMs]
  );

  // Create or get RTCPeerConnection for a specific remote peer
  const createPeerConnection = useCallback(
    (remotePeerId) => {
      const existing = peerConnectionsRef.current.get(remotePeerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (event) => {
        if (event.candidate && channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: {
              fromPeerId: peerId,
              toPeerId: remotePeerId,
              candidate: event.candidate,
            },
          });
        }
      };

      pc.ontrack = (event) => {
        const [stream] = event.streams;
        if (stream) {
          attachRemoteAudioStream(stream, remotePeerId);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peerConnectionsRef.current.delete(remotePeerId);
        }
      };

      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current);
        });
      }

      peerConnectionsRef.current.set(remotePeerId, pc);
      return pc;
    },
    [attachRemoteAudioStream, peerId]
  );

  const sendOfferToPeer = useCallback(
    async (remotePeerId) => {
      if (!localStreamRef.current || !channelRef.current) return;
      try {
        const pc = createPeerConnection(remotePeerId);
        const offer = await pc.createOffer({ offerToReceiveAudio: false });
        const mungedSdp = mungeOpusSdp(offer.sdp);
        await pc.setLocalDescription({ type: 'offer', sdp: mungedSdp });

        channelRef.current.send({
          type: 'broadcast',
          event: 'offer',
          payload: {
            fromPeerId: peerId,
            toPeerId: remotePeerId,
            sdp: pc.localDescription,
          },
        });
      } catch (err) {
        console.error('Error sending WebRTC offer:', err);
      }
    },
    [createPeerConnection, peerId]
  );

  // Initialize or update YouTube Player when videoId is set inside an active room
  useEffect(() => {
    if (!activeRoom || mode !== 'youtube' || !videoId) return;

    let cancelled = false;

    const initPlayer = async () => {
      try {
        const YT = await loadYouTubeIframeAPI();
        if (cancelled) return;

        if (ytPlayerRef.current) {
          if (typeof ytPlayerRef.current.cueVideoById === 'function') {
            ytPlayerRef.current.cueVideoById(videoId);
          }
          return;
        }

        const container = document.getElementById(YOUTUBE_CONTAINER_ID);
        if (!container) return;

        ytPlayerRef.current = new YT.Player(YOUTUBE_CONTAINER_ID, {
          height: '320',
          width: '100%',
          videoId,
          playerVars: {
            playsinline: 1,
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              if (!cancelled) setYtReady(true);
            },
            onStateChange: (event) => {
              if (cancelled || roleRef.current !== 'host') return;
              if (
                event.data === YT.PlayerState.PLAYING ||
                event.data === YT.PlayerState.PAUSED
              ) {
                const nowPlaying = event.data === YT.PlayerState.PLAYING;
                setIsPlaying(nowPlaying);
              }
            },
          },
        });
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(err?.message || 'Unable to initialize YouTube player.');
        }
      }
    };

    initPlayer();
    return () => {
      cancelled = true;
    };
  }, [activeRoom, mode, videoId]);

  // Apply host YouTube sync message on listener
  const applyListenerSync = useCallback(
    (payload, immediate = false) => {
      if (!payload || roleRef.current === 'host') return;
      latestSyncRef.current = payload;

      if (payload.videoId && payload.videoId !== videoIdRef.current) {
        setVideoId(payload.videoId);
      }
      setIsPlaying(Boolean(payload.isPlaying));

      const execute = () => {
        const player = ytPlayerRef.current;
        if (!player || typeof player.seekTo !== 'function') return;

        const now = getServerNow();
        const elapsed = payload.isPlaying
          ? Math.max(0, (now - payload.serverTimestamp) / 1000)
          : 0;
        const targetTime = Math.max(
          0,
          payload.hostTime + elapsed + nudgeOffsetMsRef.current / 1000
        );

        player.seekTo(targetTime, true);
        if (payload.isPlaying) {
          player.playVideo();
          updatePresenceStatus(adBreakRef.current ? 'Ad Break' : 'Synced');
        } else {
          player.pauseVideo();
          updatePresenceStatus('Paused');
        }
      };

      if (scheduledActionTimeoutRef.current) {
        clearTimeout(scheduledActionTimeoutRef.current);
        scheduledActionTimeoutRef.current = null;
      }

      if (!immediate && payload.executeAt) {
        const delayMs = Math.max(0, payload.executeAt - getServerNow());
        scheduledActionTimeoutRef.current = setTimeout(execute, delayMs);
      } else {
        execute();
      }
    },
    [getServerNow, updatePresenceStatus]
  );

  // Host 5-second heartbeat loop (YouTube mode)
  useEffect(() => {
    if (!activeRoom || role !== 'host' || mode !== 'youtube') return;

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      const player = ytPlayerRef.current;
      if (!channelRef.current || !player || !videoIdRef.current) return;
      if (typeof player.getCurrentTime !== 'function') return;

      const hostTime = player.getCurrentTime() || 0;
      const playingNow =
        window.YT?.PlayerState &&
        player.getPlayerState?.() === window.YT.PlayerState.PLAYING;

      channelRef.current.send({
        type: 'broadcast',
        event: 'yt-heartbeat',
        payload: {
          videoId: videoIdRef.current,
          hostTime,
          serverTimestamp: Date.now(),
          isPlaying: Boolean(playingNow),
        },
      });
    }, 5000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [activeRoom, mode, role]);

  // Listener 1-second Ad-Recovery & Drift Check loop
  useEffect(() => {
    if (!activeRoom || role !== 'listener' || mode !== 'youtube') return;

    if (adCheckIntervalRef.current) {
      clearInterval(adCheckIntervalRef.current);
    }

    adCheckIntervalRef.current = setInterval(() => {
      const sync = latestSyncRef.current;
      const player = ytPlayerRef.current;
      if (!sync || !sync.isPlaying || !player) return;
      if (typeof player.getCurrentTime !== 'function') return;

      const expectedTime =
        sync.hostTime +
        Math.max(0, (getServerNow() - sync.serverTimestamp) / 1000) +
        nudgeOffsetMsRef.current / 1000;
      const actualTime = player.getCurrentTime() || 0;
      const drift = Math.abs(expectedTime - actualTime);

      const prevTime = prevPlayerTimeRef.current;
      prevPlayerTimeRef.current = actualTime;

      if (prevTime === null) return;

      const timeDelta = actualTime - prevTime;
      const playerState = player.getPlayerState?.();
      const ytPlayingState = window.YT?.PlayerState?.PLAYING ?? 1;

      if (!adBreakRef.current) {
        // Detect ad freeze: host clock advances while main video currentTime stalls
        if (timeDelta < 0.15 && drift > 1.5) {
          freezeTicksRef.current += 1;
          if (freezeTicksRef.current >= 2) {
            adBreakRef.current = true;
            setAdBreakActive(true);
            player.mute?.();
            updatePresenceStatus('Ad Break');
          }
        } else {
          freezeTicksRef.current = 0;
          if (drift > 1.5 && playerState === ytPlayingState) {
            player.seekTo(expectedTime, true);
          }
        }
      } else {
        // Post-ad snap-back: video resumed advancing!
        if (timeDelta >= 0.25 && playerState === ytPlayingState) {
          adBreakRef.current = false;
          freezeTicksRef.current = 0;
          setAdBreakActive(false);
          player.seekTo(expectedTime, true);
          player.unMute?.();
          updatePresenceStatus('Synced');
        }
      }
    }, 1000);

    return () => {
      if (adCheckIntervalRef.current) {
        clearInterval(adCheckIntervalRef.current);
        adCheckIntervalRef.current = null;
      }
    };
  }, [activeRoom, getServerNow, mode, role, updatePresenceStatus]);

  // Connect to Supabase Realtime room channel
  const connectToRoom = useCallback(
    async (roomCode, nextRole) => {
      if (!supabase) {
        setErrorMessage(
          'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
        );
        return;
      }

      cleanupRoomResources();
      setErrorMessage('');
      setStatusMessage(`Connecting to ${roomCode}...`);

      await ensureAudioContext();
      await requestWakeLock();

      const channel = supabase.channel(`audiosync:${roomCode}`, {
        config: {
          presence: { key: peerId },
          broadcast: { self: false },
        },
      });

      channelRef.current = channel;

      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const flattened = [];
        Object.values(state).forEach((entries) => {
          entries.forEach((entry) => {
            flattened.push(entry);
          });
        });
        setPresenceList(flattened);
      });

      channel.on('broadcast', { event: 'clock-ping' }, ({ payload }) => {
        if (roleRef.current !== 'host' || !payload?.fromPeerId) return;
        channel.send({
          type: 'broadcast',
          event: 'clock-pong',
          payload: {
            toPeerId: payload.fromPeerId,
            clientSentAt: payload.clientSentAt,
            hostNow: Date.now(),
          },
        });
      });

      channel.on('broadcast', { event: 'clock-pong' }, ({ payload }) => {
        if (payload?.toPeerId !== peerId) return;
        const rtt = Date.now() - payload.clientSentAt;
        clockOffsetMsRef.current = payload.hostNow + rtt / 2 - Date.now();
      });

      channel.on('broadcast', { event: 'mode-change' }, ({ payload }) => {
        if (payload?.mode) {
          setMode(payload.mode);
        }
      });

      channel.on('broadcast', { event: 'yt-control' }, ({ payload }) => {
        setMode('youtube');
        applyListenerSync(payload, false);
      });

      channel.on('broadcast', { event: 'yt-heartbeat' }, ({ payload }) => {
        if (roleRef.current === 'host') return;
        latestSyncRef.current = payload;
        if (payload.videoId && payload.videoId !== videoIdRef.current) {
          setVideoId(payload.videoId);
        }
        setIsPlaying(Boolean(payload.isPlaying));

        const player = ytPlayerRef.current;
        if (!player || typeof player.getCurrentTime !== 'function') return;

        if (!payload.isPlaying) {
          player.pauseVideo?.();
          updatePresenceStatus('Paused');
          return;
        }

        if (!adBreakRef.current) {
          const expectedTime =
            payload.hostTime +
            Math.max(0, (getServerNow() - payload.serverTimestamp) / 1000) +
            nudgeOffsetMsRef.current / 1000;
          const actualTime = player.getCurrentTime() || 0;
          if (Math.abs(expectedTime - actualTime) > 1.5) {
            player.seekTo(expectedTime, true);
          }
          if (player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) {
            player.playVideo?.();
          }
          updatePresenceStatus('Synced');
        }
      });

      channel.on('broadcast', { event: 'peer-join' }, ({ payload }) => {
        if (!payload?.peerId || payload.peerId === peerId) return;
        if (roleRef.current === 'host') {
          // Send current mode & YouTube sync snapshot to newly joined speaker
          channel.send({
            type: 'broadcast',
            event: 'mode-change',
            payload: { mode: modeRef.current },
          });

          if (modeRef.current === 'youtube' && videoIdRef.current) {
            const player = ytPlayerRef.current;
            const hostTime =
              player && typeof player.getCurrentTime === 'function'
                ? player.getCurrentTime() || 0
                : 0;
            channel.send({
              type: 'broadcast',
              event: 'yt-heartbeat',
              payload: {
                videoId: videoIdRef.current,
                hostTime,
                serverTimestamp: Date.now(),
                isPlaying: isPlayingRef.current,
              },
            });
          } else if (
            (modeRef.current === 'system' || modeRef.current === 'mic') &&
            localStreamRef.current
          ) {
            sendOfferToPeer(payload.peerId);
          }
        }
      });

      channel.on('broadcast', { event: 'peer-leave' }, ({ payload }) => {
        if (!payload?.peerId) return;
        const pc = peerConnectionsRef.current.get(payload.peerId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(payload.peerId);
        }
      });

      channel.on('broadcast', { event: 'offer' }, async ({ payload }) => {
        if (!payload || payload.toPeerId !== peerId) return;
        try {
          const pc = createPeerConnection(payload.fromPeerId);
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
          const answer = await pc.createAnswer();
          const mungedSdp = mungeOpusSdp(answer.sdp);
          await pc.setLocalDescription({ type: 'answer', sdp: mungedSdp });
          channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: {
              fromPeerId: peerId,
              toPeerId: payload.fromPeerId,
              sdp: pc.localDescription,
            },
          });
        } catch (err) {
          console.error('Error handling WebRTC offer:', err);
        }
      });

      channel.on('broadcast', { event: 'answer' }, async ({ payload }) => {
        if (!payload || payload.toPeerId !== peerId) return;
        const pc = peerConnectionsRef.current.get(payload.fromPeerId);
        if (!pc) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        } catch (err) {
          console.error('Error applying WebRTC answer:', err);
        }
      });

      channel.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (!payload || payload.toPeerId !== peerId || !payload.candidate) return;
        const pc = peerConnectionsRef.current.get(payload.fromPeerId);
        if (!pc) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setActiveRoom(roomCode);
          setRole(nextRole);
          setNeedsSpeakerTap(false);
          setSearchParams({ room: roomCode }, { replace: true });
          setStatusMessage(
            nextRole === 'host'
              ? `Hosting room ${roomCode}. Share QR code or link with speakers.`
              : `Connected to ${roomCode} as speaker.`
          );

          await channel.track({
            peerId,
            displayName,
            role: nextRole,
            status: nextRole === 'host' ? 'Synced' : 'Connecting',
            joinedAt: Date.now(),
          });

          if (nextRole === 'listener') {
            channel.send({
              type: 'broadcast',
              event: 'clock-ping',
              payload: { fromPeerId: peerId, clientSentAt: Date.now() },
            });
            channel.send({
              type: 'broadcast',
              event: 'peer-join',
              payload: { peerId, displayName },
            });
          }
        } else if (status === 'CHANNEL_ERROR') {
          setErrorMessage('Failed to connect to Supabase Realtime room channel.');
        }
      });
    },
    [
      applyListenerSync,
      cleanupRoomResources,
      createPeerConnection,
      displayName,
      ensureAudioContext,
      getServerNow,
      peerId,
      requestWakeLock,
      sendOfferToPeer,
      setSearchParams,
      updatePresenceStatus,
    ]
  );

  const handleCreateRoom = () => {
    const code = generateRoomCode();
    setRoomInput(code);
    connectToRoom(code, 'host');
  };

  const handleJoinSpeaker = () => {
    const cleanCode = (roomInput || urlRoom).trim().toUpperCase();
    if (!cleanCode) {
      setErrorMessage('Please enter a valid room code (e.g., SYNC-842).');
      return;
    }
    connectToRoom(cleanCode, 'listener');
  };

  const handleLeaveRoom = () => {
    cleanupRoomResources();
    setActiveRoom('');
    setRole(null);
    setVideoId('');
    setIsPlaying(false);
    setStatusMessage('');
    setSearchParams({}, { replace: true });
  };

  const shareUrl = useMemo(() => {
    if (!activeRoom || typeof window === 'undefined') return '';
    return `${window.location.origin}/toolkit/audiosync?room=${encodeURIComponent(activeRoom)}`;
  }, [activeRoom]);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 1800);
    } catch {
      // Ignore clipboard errors
    }
  };

  // Host YouTube controls
  const broadcastYouTubeControl = (nextPlaying, explicitTime) => {
    if (!channelRef.current || role !== 'host' || !videoId) return;
    const player = ytPlayerRef.current;
    const hostTime =
      explicitTime !== undefined
        ? explicitTime
        : player && typeof player.getCurrentTime === 'function'
          ? player.getCurrentTime() || 0
          : 0;

    const now = Date.now();
    const executeAt = now + 1500;

    channelRef.current.send({
      type: 'broadcast',
      event: 'yt-control',
      payload: {
        videoId,
        hostTime,
        serverTimestamp: now,
        isPlaying: nextPlaying,
        executeAt,
      },
    });

    setIsPlaying(nextPlaying);

    if (scheduledActionTimeoutRef.current) {
      clearTimeout(scheduledActionTimeoutRef.current);
    }
    scheduledActionTimeoutRef.current = setTimeout(() => {
      if (!ytPlayerRef.current) return;
      if (explicitTime !== undefined) {
        ytPlayerRef.current.seekTo?.(explicitTime, true);
      }
      if (nextPlaying) {
        ytPlayerRef.current.playVideo?.();
      } else {
        ytPlayerRef.current.pauseVideo?.();
      }
    }, 1500);
  };

  const handleLoadYouTubeVideo = (e) => {
    e.preventDefault();
    setErrorMessage('');
    const extracted = extractYouTubeVideoId(ytInput);
    if (!extracted) {
      setErrorMessage(
        'Invalid YouTube URL or video ID. Supported: youtube.com/watch?v=..., youtu.be/..., shorts/..., or 11-character ID.'
      );
      return;
    }

    setVideoId(extracted);
    setIsPlaying(false);
    if (channelRef.current && role === 'host') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'yt-control',
        payload: {
          videoId: extracted,
          hostTime: 0,
          serverTimestamp: Date.now(),
          isPlaying: false,
          executeAt: Date.now() + 500,
        },
      });
    }
  };

  const handleMicroNudge = (deltaMs) => {
    const player = ytPlayerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const nextOffset = nudgeOffsetMs + deltaMs;
    setNudgeOffsetMs(nextOffset);
    const current = player.getCurrentTime() || 0;
    player.seekTo(Math.max(0, current + deltaMs / 1000), true);
  };

  // Switch host mode
  const handleSelectMode = (nextMode) => {
    if (role !== 'host') return;
    if (nextMode === 'youtube') {
      stopLocalMedia();
      closeAllPeerConnections();
    }
    setMode(nextMode);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'mode-change',
      payload: { mode: nextMode },
    });
  };

  // Start WebRTC System Audio Broadcast (Discord Mode)
  const startSystemAudioBroadcast = async () => {
    setErrorMessage('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          systemAudio: 'include',
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      // Immediately stop video tracks so no video is transmitted or stored
      stream.getVideoTracks().forEach((track) => track.stop());

      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setErrorMessage(
          'No system/tab audio track captured. Ensure "Share system audio" or "Share tab audio" is enabled in the browser prompt.'
        );
        return;
      }

      stopLocalMedia();
      localStreamRef.current = new MediaStream(audioTracks);
      setLocalStreamActive(true);

      audioTracks[0].onended = () => {
        stopLocalMedia();
        closeAllPeerConnections();
      };

      // Broadcast WebRTC offers to all currently connected listeners
      presenceList.forEach((peer) => {
        if (peer.peerId && peer.peerId !== peerId) {
          sendOfferToPeer(peer.peerId);
        }
      });
    } catch (err) {
      setErrorMessage(err?.message || 'Screen/system audio capture was cancelled or unsupported.');
    }
  };

  // Start Phone Mic Relay
  const startPhoneMicBroadcast = async () => {
    setErrorMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });

      stopLocalMedia();
      localStreamRef.current = stream;
      setLocalStreamActive(true);

      presenceList.forEach((peer) => {
        if (peer.peerId && peer.peerId !== peerId) {
          sendOfferToPeer(peer.peerId);
        }
      });
    } catch (err) {
      setErrorMessage(err?.message || 'Microphone capture permission denied or unavailable.');
    }
  };

  // Adjust WebRTC DelayNode (0–300ms)
  const updateWebrtcDelay = (nextMs) => {
    const clamped = Math.max(0, Math.min(300, nextMs));
    setWebrtcDelayMs(clamped);
    if (delayNodeRef.current && audioCtxRef.current) {
      delayNodeRef.current.delayTime.setValueAtTime(
        clamped / 1000,
        audioCtxRef.current.currentTime
      );
    }
  };

  const toggleListenerMute = () => {
    const nextMuted = !listenerMuted;
    setListenerMuted(nextMuted);
    if (gainNodeRef.current && audioCtxRef.current) {
      gainNodeRef.current.gain.setValueAtTime(
        nextMuted ? 0 : 1,
        audioCtxRef.current.currentTime
      );
    }
  };

  return (
    <div className="page-container audiosync-page">
      <Link to="/#toolkit" className="back-link">
        &larr; Back to Toolkit
      </Link>

      <div className="osint-workstation-header">
        <div className="osint-badge-line">
          <Radio size={14} strokeWidth={1.75} />
          <span>ZERO-STORAGE MULTI-DEVICE SPEAKER SYNC</span>
        </div>
        <h1 className="osint-main-title">AudioSync</h1>
        <p className="osint-subtitle">
          Real-time speaker synchronization across phones and laptops via Supabase Realtime Broadcast, YouTube IFrame API, and WebRTC. No audio files are stored.
        </p>
      </div>

      {errorMessage && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.75} />
          <span>{errorMessage}</span>
        </div>
      )}

      {!activeRoom ? (
        <div className="audiosync-lobby-grid">
          {/* Join Room Card (or Mandatory Tap-to-Join Banner when ?room= is present) */}
          <div className="audiosync-panel">
            <h2>
              <Smartphone size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Join Existing Room
            </h2>
            <p className="audiosync-panel-desc">
              {needsSpeakerTap && urlRoom
                ? `Room ${urlRoom} detected. Tap below to unlock mobile audio playback and keep your screen awake.`
                : 'Enter a room code or scan a host QR code to join as a synchronized speaker.'}
            </p>

            <div className="form-group">
              <label htmlFor="audiosync-room-code">Room Code</label>
              <input
                id="audiosync-room-code"
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                placeholder="e.g., SYNC-842K"
                className="tool-input"
              />
            </div>

            <button
              type="button"
              onClick={handleJoinSpeaker}
              className="btn tool-btn audiosync-primary-btn"
            >
              Tap to Join as Speaker
            </button>
          </div>

          {/* Create Room Card */}
          <div className="audiosync-panel">
            <h2>
              <Radio size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Host a Sync Room
            </h2>
            <p className="audiosync-panel-desc">
              Generate a room code and QR code to broadcast YouTube playback timing, system audio, or live microphone audio to connected speakers.
            </p>
            <button
              type="button"
              onClick={handleCreateRoom}
              className="btn tool-btn"
            >
              Create AudioSync Room
            </button>
          </div>
        </div>
      ) : (
        <div className="audiosync-room-container">
          {/* Room Header Bar */}
          <div className="audiosync-room-bar">
            <div>
              <div className="audiosync-room-meta">
                <span className="audiosync-room-code-pill">ROOM: {activeRoom}</span>
                <span className="audiosync-role-pill">
                  {role === 'host' ? 'HOST CONTROLLER' : 'SPEAKER NODE'}
                </span>
                <span className="audiosync-wakelock-pill">
                  {wakeLockActive ? 'WAKE LOCK ACTIVE' : 'STANDARD POWER'}
                </span>
              </div>
              {statusMessage && (
                <p className="audiosync-status-line">{statusMessage}</p>
              )}
            </div>

            <div className="audiosync-room-actions">
              <button
                type="button"
                className="osint-export-btn"
                onClick={handleCopyShareLink}
              >
                {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                <span>{copiedLink ? 'COPIED LINK' : 'COPY LINK'}</span>
              </button>
              <button
                type="button"
                className="ultron-action-btn"
                onClick={handleLeaveRoom}
              >
                <LogOut size={14} />
                <span>LEAVE ROOM</span>
              </button>
            </div>
          </div>

          {/* QR Code + Live Presence Grid */}
          <div className="audiosync-top-grid">
            <div className="audiosync-panel audiosync-qr-panel">
              <h3>Scan to Join Room</h3>
              <div className="audiosync-qr-box">
                <QRCodeSVG
                  value={shareUrl}
                  size={168}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <div className="audiosync-share-url">{shareUrl}</div>
            </div>

            <div className="audiosync-panel">
              <h3>
                <Users size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                Connected Devices ({presenceList.length})
              </h3>
              <div className="audiosync-presence-list">
                {presenceList.length === 0 ? (
                  <div className="audiosync-empty">Waiting for devices...</div>
                ) : (
                  presenceList.map((device, idx) => (
                    <div key={device.peerId || idx} className="audiosync-presence-row">
                      <div>
                        <strong>{device.displayName}</strong>
                        <span className="audiosync-presence-role">
                          {' '}
                          ({device.role === 'host' ? 'Host' : 'Speaker'})
                        </span>
                      </div>
                      <span
                        className={`status-badge ${
                          device.status === 'Ad Break'
                            ? 'status-mismatch'
                            : device.status === 'Synced'
                              ? 'status-match'
                              : 'status-connecting'
                        }`}
                      >
                        {device.status || 'Connecting'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          <div className="tab-bar audiosync-mode-tabs">
            <button
              type="button"
              className={`tab-btn ${mode === 'youtube' ? 'active' : ''}`}
              onClick={() => (role === 'host' ? handleSelectMode('youtube') : null)}
              disabled={role !== 'host' && mode !== 'youtube'}
            >
              <Tv size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              YouTube Room Sync
            </button>
            <button
              type="button"
              className={`tab-btn ${mode === 'system' ? 'active' : ''}`}
              onClick={() => (role === 'host' ? handleSelectMode('system') : null)}
              disabled={role !== 'host' && mode !== 'system'}
            >
              <Laptop size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              System Audio (Discord Mode)
            </button>
            <button
              type="button"
              className={`tab-btn ${mode === 'mic' ? 'active' : ''}`}
              onClick={() => (role === 'host' ? handleSelectMode('mic') : null)}
              disabled={role !== 'host' && mode !== 'mic'}
            >
              <Mic size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Phone Mic Relay
            </button>
          </div>

          {/* PRIMARY MODE: YOUTUBE ROOM SYNC */}
          {mode === 'youtube' && (
            <div className="audiosync-panel">
              {role === 'host' && (
                <form onSubmit={handleLoadYouTubeVideo} className="audiosync-yt-form">
                  <input
                    type="text"
                    value={ytInput}
                    onChange={(e) => setYtInput(e.target.value)}
                    placeholder="Paste YouTube URL (watch?v=..., youtu.be/..., shorts/...) or 11-char video ID"
                    className="tool-input"
                  />
                  <button type="submit" className="btn-tool">
                    Load Video
                  </button>
                </form>
              )}

              {adBreakActive && (
                <div className="auth-alert auth-alert-error" style={{ marginTop: '1rem' }}>
                  <VolumeX size={16} />
                  <span>Waiting for ad to finish... (Auto-muted until main track resumes)</span>
                </div>
              )}

              <div className="audiosync-yt-stage">
                {videoId ? (
                  <div id={YOUTUBE_CONTAINER_ID} className="audiosync-yt-frame" />
                ) : (
                  <div className="audiosync-yt-placeholder">
                    {role === 'host'
                      ? 'Load a YouTube video above to begin synchronized multi-device playback.'
                      : 'Waiting for host to load a YouTube video...'}
                  </div>
                )}
              </div>

              {videoId && (
                <div className="audiosync-controls-row">
                  {role === 'host' && (
                    <div className="audiosync-transport">
                      <button
                        type="button"
                        className="btn"
                        disabled={!ytReady}
                        onClick={() => broadcastYouTubeControl(true)}
                      >
                        <Play size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Sync Play (+1.5s)
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={!ytReady}
                        onClick={() => broadcastYouTubeControl(false)}
                      >
                        <Pause size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Sync Pause
                      </button>
                      <button
                        type="button"
                        className="btn"
                        disabled={!ytReady}
                        onClick={() => broadcastYouTubeControl(true, 0)}
                      >
                        Restart 0:00
                      </button>
                    </div>
                  )}

                  <div className="audiosync-nudge-box">
                    <span className="audiosync-nudge-label">
                      Acoustic Echo Micro-Seek:
                    </span>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => handleMicroNudge(-10)}
                    >
                      -10ms
                    </button>
                    <span className="audiosync-nudge-value">
                      {nudgeOffsetMs >= 0 ? `+${nudgeOffsetMs}ms` : `${nudgeOffsetMs}ms`}
                    </span>
                    <button
                      type="button"
                      className="copy-btn"
                      onClick={() => handleMicroNudge(10)}
                    >
                      +10ms
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SECONDARY MODE: SYSTEM AUDIO OR MIC RELAY (WEBRTC) */}
          {(mode === 'system' || mode === 'mic') && (
            <div className="audiosync-panel">
              {role === 'host' ? (
                <div className="audiosync-webrtc-host">
                  <h3>
                    {mode === 'system'
                      ? 'Laptop System / Tab Audio Broadcast (Opus Stereo 128kbps)'
                      : 'Phone / Ambient Microphone Relay'}
                  </h3>
                  <p className="audiosync-panel-desc">
                    {mode === 'system'
                      ? 'Captures desktop/tab audio via getDisplayMedia and immediately discards all video tracks. Best supported on Chrome/Edge desktop.'
                      : 'Streams live uncompressed microphone input (echoCancellation/AGC disabled) over WebRTC.'}
                  </p>

                  {!localStreamActive ? (
                    <button
                      type="button"
                      className="btn-tool"
                      onClick={
                        mode === 'system'
                          ? startSystemAudioBroadcast
                          : startPhoneMicBroadcast
                      }
                    >
                      {mode === 'system'
                        ? 'Start System Audio Broadcast'
                        : 'Start Microphone Relay'}
                    </button>
                  ) : (
                    <div className="audiosync-live-row">
                      <span className="status-badge status-match">
                        LIVE STREAMING TO {Math.max(0, presenceList.length - 1)} SPEAKER(S)
                      </span>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          stopLocalMedia();
                          closeAllPeerConnections();
                        }}
                      >
                        Stop Broadcast
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="audiosync-webrtc-listener">
                  <h3>Live WebRTC Speaker Output</h3>
                  <p className="audiosync-panel-desc">
                    {remoteAudioActive
                      ? 'Receiving live Opus audio stream routed through Web Audio DelayNode.'
                      : 'Waiting for host to start live audio broadcast...'}
                  </p>

                  <div className="audiosync-delay-control">
                    <label htmlFor="webrtc-delay-slider">
                      Speaker Delay Compensation: <strong>{webrtcDelayMs}ms</strong>
                    </label>
                    <div className="audiosync-delay-row">
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => updateWebrtcDelay(webrtcDelayMs - 5)}
                      >
                        -5ms
                      </button>
                      <input
                        id="webrtc-delay-slider"
                        type="range"
                        min="0"
                        max="300"
                        step="1"
                        value={webrtcDelayMs}
                        onChange={(e) => updateWebrtcDelay(Number(e.target.value))}
                        className="audiosync-slider"
                      />
                      <button
                        type="button"
                        className="copy-btn"
                        onClick={() => updateWebrtcDelay(webrtcDelayMs + 5)}
                      >
                        +5ms
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn"
                    onClick={toggleListenerMute}
                    style={{ marginTop: '1rem' }}
                  >
                    {listenerMuted ? (
                      <>
                        <VolumeX size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Unmute Speaker
                      </>
                    ) : (
                      <>
                        <Volume2 size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                        Mute Speaker
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Hidden muted <audio> sink for Chrome WebRTC-to-WebAudio graph activation */}
              <audio ref={remoteAudioElRef} autoPlay playsInline muted style={{ display: 'none' }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AudioSync;
