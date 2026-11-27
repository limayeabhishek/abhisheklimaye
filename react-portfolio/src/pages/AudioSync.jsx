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
  VolumeX,
  Tv,
  LogOut,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';

const YOUTUBE_CONTAINER_ID = 'audiosync-yt-player';
const YT_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const ROOM_CODE_REGEX = /^[A-Z0-9-]{3,24}$/;

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

function isValidYouTubeId(id) {
  return typeof id === 'string' && YT_VIDEO_ID_REGEX.test(id);
}

function extractYouTubeVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (isValidYouTubeId(trimmed)) {
    return trimmed;
  }

  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProto);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return isValidYouTubeId(id) ? id : null;
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com'
    ) {
      const vParam = url.searchParams.get('v');
      if (isValidYouTubeId(vParam)) {
        return vParam;
      }

      const parts = url.pathname.split('/').filter(Boolean);
      if (
        parts.length >= 2 &&
        ['shorts', 'embed', 'live', 'v'].includes(parts[0]) &&
        isValidYouTubeId(parts[1])
      ) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeSyncPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (!isValidYouTubeId(payload.videoId)) return null;
  const hostTime = Number(payload.hostTime);
  const serverTimestamp = Number(payload.serverTimestamp);
  if (!Number.isFinite(hostTime) || hostTime < 0) return null;
  if (!Number.isFinite(serverTimestamp) || serverTimestamp <= 0) return null;

  const executeAt =
    payload.executeAt !== undefined ? Number(payload.executeAt) : undefined;
  if (executeAt !== undefined && !Number.isFinite(executeAt)) return null;

  return {
    videoId: payload.videoId,
    hostTime,
    serverTimestamp,
    isPlaying: Boolean(payload.isPlaying),
    executeAt,
  };
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
  const rawUrlRoom = (searchParams.get('room') || '').trim().toUpperCase();
  const urlRoom = ROOM_CODE_REGEX.test(rawUrlRoom) ? rawUrlRoom : '';

  const [peerId] = useState(() => generatePeerId());
  const displayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Operator';

  // Lobby / Room state
  const [roomInput, setRoomInput] = useState(urlRoom);
  const [activeRoom, setActiveRoom] = useState('');
  const [role, setRole] = useState(null); // 'host' | 'listener'
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [needsSpeakerTap, setNeedsSpeakerTap] = useState(Boolean(urlRoom));
  const [needsPlayTap, setNeedsPlayTap] = useState(false);
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

  // Refs for strict lifecycle & cleanup
  const channelRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const wakeLockRef = useRef(null);

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
  const videoIdRef = useRef('');
  const isPlayingRef = useRef(false);
  const applyListenerSyncRef = useRef(null);
  const hostManualSyncBlockRef = useRef(false);

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
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const getServerNow = useCallback(() => Date.now() + clockOffsetMsRef.current, []);

  // AudioContext unlock on user gesture
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
      if (supabase) {
        supabase.removeChannel(channelRef.current).catch(() => {});
      }
      channelRef.current = null;
    }

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
    setNeedsPlayTap(false);
    setPresenceList([]);
  }, []);

  useEffect(() => {
    return () => {
      cleanupRoomResources();
    };
  }, [cleanupRoomResources]);

  // Initialize or update YouTube Player when videoId is set inside an active room
  useEffect(() => {
    if (!activeRoom || !videoId) return;

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
              if (cancelled) return;
              setYtReady(true);
              if (roleRef.current === 'listener' && latestSyncRef.current) {
                applyListenerSyncRef.current?.(latestSyncRef.current, true);
              }
            },
            onStateChange: (event) => {
              if (cancelled) return;
              if (roleRef.current === 'listener') {
                if (event.data === YT.PlayerState.PLAYING) {
                  setNeedsPlayTap(false);
                  if (!adBreakRef.current) updatePresenceStatus('Synced');
                }
                return;
              }
              if (roleRef.current !== 'host') return;
              if (
                event.data === YT.PlayerState.PLAYING ||
                event.data === YT.PlayerState.PAUSED
              ) {
                const nowPlaying = event.data === YT.PlayerState.PLAYING;
                setIsPlaying(nowPlaying);
                isPlayingRef.current = nowPlaying;
                if (!hostManualSyncBlockRef.current && channelRef.current && videoIdRef.current) {
                  const hostTime = ytPlayerRef.current?.getCurrentTime?.() || 0;
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'yt-heartbeat',
                    payload: {
                      videoId: videoIdRef.current,
                      hostTime,
                      serverTimestamp: Date.now(),
                      isPlaying: nowPlaying,
                    },
                  });
                }
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
  }, [activeRoom, videoId, updatePresenceStatus]);

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
          setTimeout(() => {
            const st = ytPlayerRef.current?.getPlayerState?.();
            const ytPlaying = window.YT?.PlayerState?.PLAYING ?? 1;
            const ytBuffering = window.YT?.PlayerState?.BUFFERING ?? 3;
            if (st !== undefined && st !== ytPlaying && st !== ytBuffering) {
              setNeedsPlayTap(true);
            }
          }, 900);
        } else {
          player.pauseVideo();
          setNeedsPlayTap(false);
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

  useEffect(() => {
    applyListenerSyncRef.current = applyListenerSync;
  }, [applyListenerSync]);

  // Host 5-second heartbeat loop
  useEffect(() => {
    if (!activeRoom || role !== 'host') return;

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
  }, [activeRoom, role]);

  // Listener 1-second Ad-Recovery & Drift Check loop
  useEffect(() => {
    if (!activeRoom || role !== 'listener') return;

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
      } else if (timeDelta >= 0.25 && playerState === ytPlayingState) {
        adBreakRef.current = false;
        freezeTicksRef.current = 0;
        setAdBreakActive(false);
        player.seekTo(expectedTime, true);
        player.unMute?.();
        updatePresenceStatus('Synced');
      }
    }, 1000);

    return () => {
      if (adCheckIntervalRef.current) {
        clearInterval(adCheckIntervalRef.current);
        adCheckIntervalRef.current = null;
      }
    };
  }, [activeRoom, getServerNow, role, updatePresenceStatus]);

  // Connect to Supabase Realtime room channel
  const connectToRoom = useCallback(
    async (roomCode, nextRole) => {
      if (!ROOM_CODE_REGEX.test(roomCode)) {
        setErrorMessage('Invalid room code format. Use 3–24 uppercase letters, numbers, or hyphens.');
        return;
      }

      if (!supabase) {
        setErrorMessage(
          'Supabase client is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
        );
        return;
      }

      cleanupRoomResources();
      setErrorMessage('');
      setJoiningRoom(true);
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
        const clientSentAt = Number(payload.clientSentAt);
        if (!Number.isFinite(clientSentAt)) return;
        channel.send({
          type: 'broadcast',
          event: 'clock-pong',
          payload: {
            toPeerId: payload.fromPeerId,
            clientSentAt,
            hostNow: Date.now(),
          },
        });
      });

      channel.on('broadcast', { event: 'clock-pong' }, ({ payload }) => {
        if (payload?.toPeerId !== peerId) return;
        const clientSentAt = Number(payload.clientSentAt);
        const hostNow = Number(payload.hostNow);
        if (!Number.isFinite(clientSentAt) || !Number.isFinite(hostNow)) return;
        const rtt = Math.max(0, Date.now() - clientSentAt);
        clockOffsetMsRef.current = hostNow + rtt / 2 - Date.now();
        if (roleRef.current === 'listener' && !latestSyncRef.current) {
          updatePresenceStatus('Standby');
        }
      });

      channel.on('broadcast', { event: 'host-ready' }, () => {
        if (roleRef.current !== 'listener') return;
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
      });

      channel.on('broadcast', { event: 'yt-control' }, ({ payload }) => {
        const sanitized = sanitizeSyncPayload(payload);
        if (!sanitized) return;
        applyListenerSync(sanitized, false);
      });

      channel.on('broadcast', { event: 'yt-heartbeat' }, ({ payload }) => {
        if (roleRef.current === 'host') return;
        const sanitized = sanitizeSyncPayload(payload);
        if (!sanitized) return;

        latestSyncRef.current = sanitized;
        if (sanitized.videoId !== videoIdRef.current) {
          setVideoId(sanitized.videoId);
        }
        setIsPlaying(sanitized.isPlaying);

        const player = ytPlayerRef.current;
        if (!player || typeof player.getCurrentTime !== 'function') return;

        if (!sanitized.isPlaying) {
          player.pauseVideo?.();
          updatePresenceStatus('Paused');
          return;
        }

        if (!adBreakRef.current) {
          const expectedTime =
            sanitized.hostTime +
            Math.max(0, (getServerNow() - sanitized.serverTimestamp) / 1000) +
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
        if (roleRef.current === 'host' && videoIdRef.current) {
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
        }
      });

      let subscribed = false;
      const joinTimeout = setTimeout(() => {
        if (!subscribed) {
          setJoiningRoom(false);
          setErrorMessage('Connection to room timed out. Please check your connection and try again.');
        }
      }, 10000);

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          subscribed = true;
          clearTimeout(joinTimeout);
          roleRef.current = nextRole;
          activeRoomRef.current = roomCode;
          setJoiningRoom(false);
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
            status: nextRole === 'host' ? 'Synced' : 'Standby',
            joinedAt: Date.now(),
          });

          if (nextRole === 'host') {
            channel.send({
              type: 'broadcast',
              event: 'host-ready',
              payload: { peerId },
            });
          } else {
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
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          clearTimeout(joinTimeout);
          setJoiningRoom(false);
          setErrorMessage('Failed to connect to Supabase Realtime room channel.');
        }
      });
    },
    [
      applyListenerSync,
      cleanupRoomResources,
      displayName,
      ensureAudioContext,
      getServerNow,
      peerId,
      requestWakeLock,
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
    if (!ROOM_CODE_REGEX.test(cleanCode)) {
      setErrorMessage('Please enter a valid room code (e.g., SYNC-842K).');
      return;
    }
    connectToRoom(cleanCode, 'listener');
  };

  const handleLeaveRoom = () => {
    cleanupRoomResources();
    roleRef.current = null;
    activeRoomRef.current = '';
    setJoiningRoom(false);
    setActiveRoom('');
    setRole(null);
    setVideoId('');
    setIsPlaying(false);
    setStatusMessage('');
    setSearchParams({}, { replace: true });
  };

  const shareUrl = useMemo(() => {
    if (!activeRoom || typeof window === 'undefined') return '';
    return `${window.location.origin}/gamezone/audiosync?room=${encodeURIComponent(activeRoom)}`;
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
      hostManualSyncBlockRef.current = true;
      if (explicitTime !== undefined) {
        ytPlayerRef.current.seekTo?.(explicitTime, true);
      }
      if (nextPlaying) {
        ytPlayerRef.current.playVideo?.();
      } else {
        ytPlayerRef.current.pauseVideo?.();
      }
      setTimeout(() => {
        hostManualSyncBlockRef.current = false;
      }, 600);
    }, 1500);
  };

  const handleLoadYouTubeVideo = (e) => {
    e.preventDefault();
    setErrorMessage('');
    const extracted = extractYouTubeVideoId(ytInput);
    if (!extracted) {
      setErrorMessage(
        'Only YouTube links or 11-character YouTube video IDs are supported (youtube.com/watch?v=..., youtu.be/..., shorts/...).'
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

  return (
    <div className="page-container audiosync-page">
      <Link to="/#gamezone" className="back-link">
        &larr; Back to Gamezone
      </Link>

      <div className="osint-workstation-header">
        <div className="osint-badge-line">
          <Radio size={14} strokeWidth={1.75} />
          <span>ZERO-STORAGE MULTI-DEVICE YOUTUBE SYNC</span>
        </div>
        <h1 className="osint-main-title">AudioSync</h1>
        <p className="osint-subtitle">
          Synchronize YouTube playback across phones and laptops in real time using Supabase Realtime Broadcast, QR room pairing, Wake Lock, and ad-resilient drift recovery.
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
                maxLength={24}
                className="tool-input"
              />
            </div>

            <button
              type="button"
              onClick={handleJoinSpeaker}
              disabled={joiningRoom}
              className="btn tool-btn audiosync-primary-btn"
            >
              {joiningRoom ? 'Connecting to Room...' : 'Tap to Join as Speaker'}
            </button>
          </div>

          <div className="audiosync-panel">
            <h2>
              <Radio size={18} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              Host a Sync Room
            </h2>
            <p className="audiosync-panel-desc">
              Generate a room code and QR code to synchronize YouTube playback timing across connected devices.
            </p>
            <button
              type="button"
              onClick={handleCreateRoom}
              disabled={joiningRoom}
              className="btn tool-btn"
            >
              {joiningRoom ? 'Creating Room...' : 'Create AudioSync Room'}
            </button>
          </div>
        </div>
      ) : (
        <div className="audiosync-room-container">
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
                        {device.status || 'Standby'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="audiosync-panel">
            <div className="audiosync-yt-header">
              <Tv size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
              <span>YouTube Link Sync</span>
            </div>

            {role === 'host' && (
              <form onSubmit={handleLoadYouTubeVideo} className="audiosync-yt-form">
                <input
                  type="text"
                  value={ytInput}
                  onChange={(e) => setYtInput(e.target.value)}
                  placeholder="Paste YouTube URL (youtube.com/watch?v=..., youtu.be/..., shorts/...) or 11-char video ID"
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

            {role === 'listener' && needsPlayTap && (
              <div style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className="btn tool-btn audiosync-primary-btn"
                  onClick={() => {
                    setNeedsPlayTap(false);
                    if (latestSyncRef.current) {
                      applyListenerSync(latestSyncRef.current, true);
                    } else {
                      ytPlayerRef.current?.playVideo?.();
                    }
                  }}
                >
                  <Play size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Tap to Start Synced Playback
                </button>
              </div>
            )}

            <div className="audiosync-yt-stage">
              {videoId ? (
                <div id={YOUTUBE_CONTAINER_ID} className="audiosync-yt-frame" />
              ) : (
                <div className="audiosync-yt-placeholder">
                  {role === 'host'
                    ? 'Paste a YouTube link above to begin synchronized multi-device playback.'
                    : presenceList.some((d) => d.role === 'host')
                      ? 'Connected to host. Waiting for host to load a YouTube link...'
                      : `Connected to ${activeRoom}. Waiting for host to join this room...`}
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
        </div>
      )}
    </div>
  );
};

export default AudioSync;
