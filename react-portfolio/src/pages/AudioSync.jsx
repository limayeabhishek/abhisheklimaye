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
  Volume2,
  Tv,
  AlertCircle,
  RefreshCw,
  Clock,
  Crown,
  Plus,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';
import { useServerTime } from '../hooks/useServerTime';

const LIVE_ROOM_ID = 'LIVE';
const LIVE_CHANNEL_NAME = 'audiosync-live';
const YOUTUBE_CONTAINER_ID = 'audiosync-yt-player';
const YT_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const ROOM_CODE_REGEX = /^[A-Z0-9-]{3,24}$/;
const PLAY_SCHEDULE_LEAD_MS = 1500;
const SEEK_BUFFER_LEAD_SEC = 0.35;

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
  if (isValidYouTubeId(trimmed)) return trimmed;

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
      if (isValidYouTubeId(vParam)) return vParam;

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

  const trackPositionSec = Number(payload.trackPositionSec);
  const startAtServerMs = Number(payload.startAtServerMs);
  if (!Number.isFinite(trackPositionSec) || trackPositionSec < 0) return null;
  if (!Number.isFinite(startAtServerMs) || startAtServerMs <= 0) return null;

  return {
    action: typeof payload.action === 'string' ? payload.action : 'PLAY',
    videoId: payload.videoId,
    trackPositionSec,
    startAtServerMs,
    isPlaying: Boolean(payload.isPlaying),
    preBuffered: Boolean(payload.preBuffered),
  };
}

let ytApiPromise = null;
function loadYouTubeIframeAPI() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window unavailable'));
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
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
  const initialRoom = ROOM_CODE_REGEX.test(rawUrlRoom) ? rawUrlRoom : LIVE_ROOM_ID;

  const {
    getServerNow,
    offsetMs,
    rttMs,
    isSynced: serverTimeSynced,
    serverClockStr,
    resyncClock,
  } = useServerTime();

  const [peerId] = useState(() => generatePeerId());
  const displayName =
    profile?.display_name || user?.email?.split('@')[0] || 'Operator';

  // Room state — auto-joins shared `audiosync-live` room or `?room=`
  const [activeRoom, setActiveRoom] = useState(initialRoom);
  const [roomInput, setRoomInput] = useState('');
  const [role, setRole] = useState(initialRoom === LIVE_ROOM_ID ? 'listener' : 'listener');
  const [channelStatus, setChannelStatus] = useState('Connecting...');
  const [copiedLink, setCopiedLink] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [presenceList, setPresenceList] = useState([]);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [needsPlayTap, setNeedsPlayTap] = useState(false);

  // YouTube Sync state
  const [ytInput, setYtInput] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [nudgeOffsetMs, setNudgeOffsetMs] = useState(0);
  const [adBreakActive, setAdBreakActive] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [driftMs, setDriftMs] = useState(null);
  const [playbackRate, setPlaybackRate] = useState(1);

  // Refs for lifecycle & cleanup
  const channelRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const wakeLockRef = useRef(null);

  const heartbeatIntervalRef = useRef(null);
  const driftLoopIntervalRef = useRef(null);
  const scheduledActionTimeoutRef = useRef(null);

  const lastSeekAtRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const prevPlayerTimeRef = useRef(null);
  const latestSyncRef = useRef(null);
  const adBreakRef = useRef(false);
  const nudgeOffsetMsRef = useRef(0);
  const activeRoomRef = useRef(initialRoom);
  const roleRef = useRef('listener');
  const videoIdRef = useRef('');
  const isPlayingRef = useRef(false);
  const applyListenerSyncRef = useRef(null);
  const hostControlFnRef = useRef(null);
  const hostManualSyncBlockRef = useRef(false);
  const getServerNowRef = useRef(getServerNow);

  useEffect(() => {
    getServerNowRef.current = getServerNow;
  }, [getServerNow]);

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

  // Expected track position anchored strictly to authoritative server time
  const computeExpectedVideoTime = useCallback((syncPayload) => {
    if (!syncPayload) return 0;
    if (!syncPayload.isPlaying) {
      return Math.max(0, syncPayload.trackPositionSec + nudgeOffsetMsRef.current / 1000);
    }
    const elapsedSec = Math.max(
      0,
      (getServerNowRef.current() - syncPayload.startAtServerMs) / 1000
    );
    return Math.max(
      0,
      syncPayload.trackPositionSec + elapsedSec + nudgeOffsetMsRef.current / 1000
    );
  }, []);

  const ensureAudioContextAndWakeLock = useCallback(async () => {
    if (typeof window !== 'undefined') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) {
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
      }
      setAudioUnlocked(true);
    }

    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      try {
        if (wakeLockRef.current) {
          await wakeLockRef.current.release().catch(() => {});
        }
        const sentinel = await navigator.wakeLock.request('screen');
        wakeLockRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener('release', () => setWakeLockActive(false));
      } catch {
        setWakeLockActive(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeRoomRef.current && audioUnlocked) {
        ensureAudioContextAndWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [audioUnlocked, ensureAudioContextAndWakeLock]);

  const updatePresenceStatus = useCallback(
    async (statusText, overrideRole) => {
      if (!channelRef.current) return;
      try {
        await channelRef.current.track({
          peerId,
          user_id: user?.id || peerId,
          display_name: displayName,
          role: overrideRole || roleRef.current || 'listener',
          status: statusText,
          joined_at: getServerNowRef.current(),
        });
      } catch {
        // Ignore errors if channel is closing
      }
    },
    [displayName, peerId, user?.id]
  );

  const cleanupRoomResources = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (driftLoopIntervalRef.current) {
      clearInterval(driftLoopIntervalRef.current);
      driftLoopIntervalRef.current = null;
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
        ytPlayerRef.current.setPlaybackRate?.(1);
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

    lastSeekAtRef.current = 0;
    lastProgressAtRef.current = 0;
    latestSyncRef.current = null;
    prevPlayerTimeRef.current = null;
    adBreakRef.current = false;
    setAdBreakActive(false);
    setNeedsPlayTap(false);
    setDriftMs(null);
    setPlaybackRate(1);
    setPresenceList([]);
  }, []);

  useEffect(() => {
    return () => {
      cleanupRoomResources();
    };
  }, [cleanupRoomResources]);

  // Initialize / update YouTube Player when videoId is set
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
                  lastProgressAtRef.current = Date.now();
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
                  const serverNow = getServerNowRef.current();
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'playback',
                    payload: {
                      action: nowPlaying ? 'PLAY' : 'PAUSE',
                      videoId: videoIdRef.current,
                      trackPositionSec: hostTime,
                      startAtServerMs: serverNow,
                      isPlaying: nowPlaying,
                      preBuffered: false,
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

  // Apply authoritative server-timestamped broadcast on listener
  const applyListenerSync = useCallback(
    (payload, forceImmediate = false) => {
      if (!payload || roleRef.current === 'host') return;
      latestSyncRef.current = payload;

      if (payload.videoId && payload.videoId !== videoIdRef.current) {
        setVideoId(payload.videoId);
      }
      setIsPlaying(Boolean(payload.isPlaying));

      if (scheduledActionTimeoutRef.current) {
        clearTimeout(scheduledActionTimeoutRef.current);
        scheduledActionTimeoutRef.current = null;
      }

      const player = ytPlayerRef.current;
      if (!player || typeof player.seekTo !== 'function') return;

      player.setPlaybackRate?.(1);
      setPlaybackRate(1);

      if (!payload.isPlaying) {
        player.pauseVideo?.();
        const target = Math.max(0, payload.trackPositionSec + nudgeOffsetMsRef.current / 1000);
        const current = player.getCurrentTime?.() || 0;
        if (Math.abs(current - target) > 0.15) {
          lastSeekAtRef.current = Date.now();
          player.seekTo(target, true);
          player.pauseVideo?.();
        }
        setNeedsPlayTap(false);
        setDriftMs(0);
        updatePresenceStatus('Paused');
        return;
      }

      const startAtTarget = () => {
        const p = ytPlayerRef.current;
        if (!p || typeof p.seekTo !== 'function') return;

        const expectedNow = computeExpectedVideoTime(payload);
        const current = p.getCurrentTime?.() || 0;
        if (Math.abs(current - expectedNow) > 0.15) {
          lastSeekAtRef.current = Date.now();
          p.seekTo(expectedNow + SEEK_BUFFER_LEAD_SEC, true);
        }
        p.setPlaybackRate?.(1);
        setPlaybackRate(1);
        p.playVideo?.();
        lastProgressAtRef.current = Date.now();
        updatePresenceStatus(adBreakRef.current ? 'Ad Break' : 'Synced');

        setTimeout(() => {
          const st = ytPlayerRef.current?.getPlayerState?.();
          const ytPlaying = window.YT?.PlayerState?.PLAYING ?? 1;
          const ytBuffering = window.YT?.PlayerState?.BUFFERING ?? 3;
          if (st !== undefined && st !== ytPlaying && st !== ytBuffering) {
            setNeedsPlayTap(true);
          }
        }, 900);
      };

      const delayMs = !forceImmediate
        ? payload.startAtServerMs - getServerNowRef.current()
        : 0;

      if (delayMs > 60) {
        const preTarget = Math.max(
          0,
          payload.trackPositionSec + nudgeOffsetMsRef.current / 1000
        );
        lastSeekAtRef.current = Date.now();
        player.seekTo(preTarget, true);
        player.pauseVideo?.();
        updatePresenceStatus('Syncing');
        scheduledActionTimeoutRef.current = setTimeout(startAtTarget, delayMs);
      } else {
        startAtTarget();
      }
    },
    [computeExpectedVideoTime, updatePresenceStatus]
  );

  useEffect(() => {
    applyListenerSyncRef.current = applyListenerSync;
  }, [applyListenerSync]);

  // Host 2-second heartbeat anchored to authoritative server time
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
        event: 'heartbeat',
        payload: {
          action: playingNow ? 'PLAY' : 'PAUSE',
          videoId: videoIdRef.current,
          trackPositionSec: hostTime,
          startAtServerMs: getServerNowRef.current(),
          isPlaying: Boolean(playingNow),
          preBuffered: false,
        },
      });
    }, 2000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [activeRoom, role]);

  // Speaker 500ms smooth playbackRate drift catch-up (0.08s threshold) & Ad-Break recovery
  useEffect(() => {
    if (!activeRoom || role !== 'listener') return;

    if (driftLoopIntervalRef.current) {
      clearInterval(driftLoopIntervalRef.current);
    }

    driftLoopIntervalRef.current = setInterval(() => {
      const sync = latestSyncRef.current;
      const player = ytPlayerRef.current;
      if (!sync || !sync.isPlaying || !player) return;
      if (typeof player.getCurrentTime !== 'function') return;
      if (scheduledActionTimeoutRef.current) return;

      const expectedTime = computeExpectedVideoTime(sync);
      const actualTime = player.getCurrentTime() || 0;
      const signedDrift = expectedTime - actualTime;
      const absDrift = Math.abs(signedDrift);

      const prevTime = prevPlayerTimeRef.current;
      prevPlayerTimeRef.current = actualTime;

      if (prevTime !== null && Math.abs(actualTime - prevTime) >= 0.15) {
        lastProgressAtRef.current = Date.now();
      }
      if (lastProgressAtRef.current === 0) {
        lastProgressAtRef.current = Date.now();
      }

      const playerState = player.getPlayerState?.();
      const ytPlayingState = window.YT?.PlayerState?.PLAYING ?? 1;
      const seekCooldownActive = Date.now() - lastSeekAtRef.current < 2200;

      setDriftMs(Math.round(signedDrift * 1000));

      if (!adBreakRef.current) {
        if (Date.now() - lastProgressAtRef.current >= 2200 && absDrift > 1.5) {
          adBreakRef.current = true;
          setAdBreakActive(true);
          player.setPlaybackRate?.(1);
          setPlaybackRate(1);
          player.mute?.();
          updatePresenceStatus('Ad Break');
          return;
        }

        if (playerState !== ytPlayingState) return;

        if (absDrift > 1.25 && !seekCooldownActive) {
          lastSeekAtRef.current = Date.now();
          player.setPlaybackRate?.(1);
          setPlaybackRate(1);
          player.seekTo(expectedTime + SEEK_BUFFER_LEAD_SEC, true);
        } else if (absDrift > 0.08 && !seekCooldownActive) {
          const targetRate = signedDrift > 0 ? 1.25 : 0.75;
          if (player.getPlaybackRate?.() !== targetRate) {
            player.setPlaybackRate?.(targetRate);
            setPlaybackRate(targetRate);
          }
        } else if (player.getPlaybackRate?.() !== 1) {
          player.setPlaybackRate?.(1);
          setPlaybackRate(1);
        }
      } else if (
        prevTime !== null &&
        actualTime - prevTime >= 0.15 &&
        playerState === ytPlayingState
      ) {
        adBreakRef.current = false;
        setAdBreakActive(false);
        lastSeekAtRef.current = Date.now();
        player.setPlaybackRate?.(1);
        setPlaybackRate(1);
        player.seekTo(expectedTime + SEEK_BUFFER_LEAD_SEC, true);
        player.unMute?.();
        updatePresenceStatus('Synced');
      }
    }, 500);

    return () => {
      if (driftLoopIntervalRef.current) {
        clearInterval(driftLoopIntervalRef.current);
        driftLoopIntervalRef.current = null;
      }
    };
  }, [activeRoom, computeExpectedVideoTime, role, updatePresenceStatus]);

  // Host control broadcasts (Sync Play / Universal Pause / Restart)
  const broadcastYouTubeControl = useCallback((actionMode, explicitTime) => {
    if (!channelRef.current || roleRef.current !== 'host' || !videoIdRef.current) return;
    const player = ytPlayerRef.current;
    const currentHostTime =
      explicitTime !== undefined
        ? explicitTime
        : player && typeof player.getCurrentTime === 'function'
          ? player.getCurrentTime() || 0
          : 0;

    if (scheduledActionTimeoutRef.current) {
      clearTimeout(scheduledActionTimeoutRef.current);
      scheduledActionTimeoutRef.current = null;
    }

    const serverNow = getServerNowRef.current();

    if (actionMode === 'pause') {
      channelRef.current.send({
        type: 'broadcast',
        event: 'playback',
        payload: {
          action: 'PAUSE',
          videoId: videoIdRef.current,
          trackPositionSec: currentHostTime,
          startAtServerMs: serverNow,
          isPlaying: false,
          preBuffered: false,
        },
      });
      setIsPlaying(false);
      isPlayingRef.current = false;
      if (player) {
        hostManualSyncBlockRef.current = true;
        if (explicitTime !== undefined) player.seekTo?.(explicitTime, true);
        player.pauseVideo?.();
        setTimeout(() => {
          hostManualSyncBlockRef.current = false;
        }, 400);
      }
      return;
    }

    const startAtServerMs = serverNow + PLAY_SCHEDULE_LEAD_MS;
    const hostCurrentlyPlaying =
      explicitTime === undefined &&
      actionMode === 'resync' &&
      window.YT?.PlayerState &&
      player?.getPlayerState?.() === window.YT.PlayerState.PLAYING;

    const targetPos = hostCurrentlyPlaying
      ? currentHostTime + PLAY_SCHEDULE_LEAD_MS / 1000
      : currentHostTime;

    channelRef.current.send({
      type: 'broadcast',
      event: 'playback',
      payload: {
        action: explicitTime !== undefined ? 'SEEK' : 'PLAY',
        videoId: videoIdRef.current,
        trackPositionSec: targetPos,
        startAtServerMs,
        isPlaying: true,
        preBuffered: true,
      },
    });

    setIsPlaying(true);
    isPlayingRef.current = true;

    if (player) {
      hostManualSyncBlockRef.current = true;
      if (!hostCurrentlyPlaying) {
        player.seekTo?.(targetPos, true);
        player.pauseVideo?.();
        scheduledActionTimeoutRef.current = setTimeout(() => {
          ytPlayerRef.current?.playVideo?.();
          setTimeout(() => {
            hostManualSyncBlockRef.current = false;
          }, 500);
        }, PLAY_SCHEDULE_LEAD_MS);
      } else {
        setTimeout(() => {
          hostManualSyncBlockRef.current = false;
        }, 500);
      }
    }
  }, []);

  useEffect(() => {
    hostControlFnRef.current = broadcastYouTubeControl;
  }, [broadcastYouTubeControl]);

  // Connect to shared `audiosync-live` or custom room `audiosync:<roomCode>`
  const joinChannel = useCallback(
    (roomCode, nextRole) => {
      if (!ROOM_CODE_REGEX.test(roomCode)) {
        setErrorMessage('Invalid room code format.');
        return;
      }
      if (!supabase) {
        setErrorMessage('Supabase client is not configured.');
        return;
      }

      cleanupRoomResources();
      setErrorMessage('');
      setChannelStatus('Connecting...');
      roleRef.current = nextRole;
      activeRoomRef.current = roomCode;
      setRole(nextRole);
      setActiveRoom(roomCode);

      if (roomCode === LIVE_ROOM_ID) {
        setSearchParams({}, { replace: true });
      } else {
        setSearchParams({ room: roomCode }, { replace: true });
      }

      const channelTopic =
        roomCode === LIVE_ROOM_ID ? LIVE_CHANNEL_NAME : `audiosync:${roomCode}`;

      const channel = supabase.channel(channelTopic, {
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
          entries.forEach((entry) => flattened.push(entry));
        });
        setPresenceList(flattened);
      });

      channel.on('broadcast', { event: 'host-claimed' }, ({ payload }) => {
        if (!payload?.hostPeerId || payload.hostPeerId === peerId) return;
        if (roleRef.current === 'host') {
          roleRef.current = 'listener';
          setRole('listener');
          updatePresenceStatus('Synced', 'listener');
        }
      });

      channel.on('broadcast', { event: 'universal-signal' }, ({ payload }) => {
        if (roleRef.current !== 'host' || !payload) return;
        if (payload.command === 'pause') {
          hostControlFnRef.current?.('pause');
        } else if (payload.command === 'play') {
          hostControlFnRef.current?.('resync');
        }
      });

      channel.on('broadcast', { event: 'playback' }, ({ payload }) => {
        const sanitized = sanitizeSyncPayload(payload);
        if (!sanitized) return;
        applyListenerSync(sanitized, !sanitized.isPlaying);
      });

      channel.on('broadcast', { event: 'heartbeat' }, ({ payload }) => {
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
        if (scheduledActionTimeoutRef.current) return;

        if (!sanitized.isPlaying) {
          player.setPlaybackRate?.(1);
          setPlaybackRate(1);
          player.pauseVideo?.();
          const current = player.getCurrentTime() || 0;
          const target = Math.max(
            0,
            sanitized.trackPositionSec + nudgeOffsetMsRef.current / 1000
          );
          if (Math.abs(current - target) > 0.2) {
            lastSeekAtRef.current = Date.now();
            player.seekTo(target, true);
            player.pauseVideo?.();
          }
          setNeedsPlayTap(false);
          updatePresenceStatus('Paused');
          return;
        }

        if (!adBreakRef.current) {
          if (player.getPlayerState?.() !== window.YT?.PlayerState?.PLAYING) {
            const expected = computeExpectedVideoTime(sanitized);
            lastSeekAtRef.current = Date.now();
            player.seekTo(expected + SEEK_BUFFER_LEAD_SEC, true);
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
            event: 'heartbeat',
            payload: {
              action: isPlayingRef.current ? 'PLAY' : 'PAUSE',
              videoId: videoIdRef.current,
              trackPositionSec: hostTime,
              startAtServerMs: getServerNowRef.current(),
              isPlaying: isPlayingRef.current,
              preBuffered: false,
            },
          });
        }
      });

      channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setChannelStatus('Live');
          await channel.track({
            peerId,
            user_id: user?.id || peerId,
            display_name: displayName,
            role: nextRole,
            status: nextRole === 'host' ? 'Host' : 'Standby',
            joined_at: getServerNowRef.current(),
          });

          if (nextRole === 'host') {
            channel.send({
              type: 'broadcast',
              event: 'host-claimed',
              payload: { hostPeerId: peerId },
            });
          } else {
            channel.send({
              type: 'broadcast',
              event: 'peer-join',
              payload: { peerId, displayName },
            });
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setChannelStatus('Disconnected');
          setErrorMessage('Failed to connect to Supabase Realtime room.');
        }
      });
    },
    [
      applyListenerSync,
      cleanupRoomResources,
      computeExpectedVideoTime,
      displayName,
      peerId,
      setSearchParams,
      updatePresenceStatus,
      user?.id,
    ]
  );

  // Auto-join live room on mount
  useEffect(() => {
    joinChannel(initialRoom, 'listener');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBecomeHost = async () => {
    await ensureAudioContextAndWakeLock();
    roleRef.current = 'host';
    setRole('host');
    channelRef.current?.send({
      type: 'broadcast',
      event: 'host-claimed',
      payload: { hostPeerId: peerId },
    });
    updatePresenceStatus('Host', 'host');
  };

  const handleCreatePrivateRoom = async () => {
    await ensureAudioContextAndWakeLock();
    const code = generateRoomCode();
    setVideoId('');
    setIsPlaying(false);
    joinChannel(code, 'host');
  };

  const handleJoinCustomRoom = async (e) => {
    e.preventDefault();
    const clean = roomInput.trim().toUpperCase();
    if (!ROOM_CODE_REGEX.test(clean)) {
      setErrorMessage('Enter a valid room code (e.g., SYNC-842K or LIVE).');
      return;
    }
    await ensureAudioContextAndWakeLock();
    setVideoId('');
    setIsPlaying(false);
    joinChannel(clean, 'listener');
  };

  const handleUniversalToggle = async () => {
    await ensureAudioContextAndWakeLock();
    const nextCmd = isPlaying ? 'pause' : 'play';
    if (role === 'host') {
      broadcastYouTubeControl(nextCmd);
      return;
    }
    channelRef.current?.send({
      type: 'broadcast',
      event: 'universal-signal',
      payload: { command: nextCmd, fromPeerId: peerId },
    });
  };

  const handleLoadYouTubeVideo = async (e) => {
    e.preventDefault();
    await ensureAudioContextAndWakeLock();
    setErrorMessage('');
    const extracted = extractYouTubeVideoId(ytInput);
    if (!extracted) {
      setErrorMessage(
        'Only YouTube links or 11-character YouTube video IDs are supported (youtube.com/watch?v=..., youtu.be/..., shorts/...).'
      );
      return;
    }

    if (roleRef.current !== 'host') {
      roleRef.current = 'host';
      setRole('host');
      channelRef.current?.send({
        type: 'broadcast',
        event: 'host-claimed',
        payload: { hostPeerId: peerId },
      });
      updatePresenceStatus('Host', 'host');
    }

    setVideoId(extracted);
    setIsPlaying(false);
    channelRef.current?.send({
      type: 'broadcast',
      event: 'playback',
      payload: {
        action: 'TRACK_CHANGE',
        videoId: extracted,
        trackPositionSec: 0,
        startAtServerMs: getServerNowRef.current(),
        isPlaying: false,
        preBuffered: false,
      },
    });
  };

  const handleMicroNudge = (deltaMs) => {
    const player = ytPlayerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return;
    const nextOffset = nudgeOffsetMs + deltaMs;
    setNudgeOffsetMs(nextOffset);
    const current = player.getCurrentTime() || 0;
    lastSeekAtRef.current = Date.now();
    player.seekTo(Math.max(0, current + deltaMs / 1000), true);
  };

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return activeRoom === LIVE_ROOM_ID
      ? `${window.location.origin}/gamezone/audiosync`
      : `${window.location.origin}/gamezone/audiosync?room=${encodeURIComponent(activeRoom)}`;
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

  return (
    <div className="page-container audiosync-page">
      <Link to="/#gamezone" className="back-link">
        &larr; Back to Gamezone
      </Link>

      <div className="osint-workstation-header">
        <div className="osint-badge-line">
          <Radio size={14} strokeWidth={1.75} />
          <span>SERVER-TIMESTAMPED MULTI-DEVICE LIVE ROOM</span>
        </div>
        <h1 className="osint-main-title">AudioSync</h1>
        <p className="osint-subtitle">
          Synchronized multi-device playback anchored to an authoritative server clock (`/api/time`) and Supabase Realtime Presence.
        </p>
      </div>

      {/* Live Server Clock & Offset Telemetry Header */}
      <div className="audiosync-room-bar">
        <div>
          <div className="audiosync-room-meta">
            <span className="audiosync-room-code-pill">
              ROOM: {activeRoom === LIVE_ROOM_ID ? 'AUDIOSYNC-LIVE' : activeRoom}
            </span>
            <span className="audiosync-role-pill">
              {role === 'host' ? 'HOST CONTROLLER' : 'LISTENER'} ({channelStatus})
            </span>
            <span className="audiosync-wakelock-pill">
              <Clock size={12} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
              SERVER: {serverClockStr}
            </span>
            <span className="audiosync-wakelock-pill">
              SYNC OFFSET: {serverTimeSynced ? `${offsetMs >= 0 ? '+' : ''}${offsetMs}ms` : 'CALIBRATING...'}
              {rttMs !== null ? ` (RTT ${rttMs}ms)` : ''}
            </span>
            {role === 'listener' && driftMs !== null && (
              <span className="audiosync-wakelock-pill">
                DRIFT: {driftMs >= 0 ? '+' : ''}{driftMs}ms{playbackRate !== 1 ? ` (${playbackRate}x)` : ''}
              </span>
            )}
            <span className="audiosync-wakelock-pill">
              {wakeLockActive ? 'WAKE LOCK ON' : 'WAKE LOCK OFF'}
            </span>
          </div>
        </div>

        <div className="audiosync-room-actions">
          <button
            type="button"
            className="osint-export-btn"
            onClick={resyncClock}
            title="Re-calibrate clock offset against /api/time"
          >
            <RefreshCw size={14} />
            <span>SYNC CLOCK</span>
          </button>
          <button
            type="button"
            className="osint-export-btn"
            onClick={handleCopyShareLink}
          >
            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
            <span>{copiedLink ? 'COPIED' : 'COPY LINK'}</span>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="auth-alert auth-alert-error" role="alert">
          <AlertCircle size={16} strokeWidth={1.75} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Mobile Speaker Unlock / Wake Lock Banner */}
      {!audioUnlocked && (
        <div style={{ marginBottom: '1.25rem' }}>
          <button
            type="button"
            className="btn tool-btn audiosync-primary-btn"
            onClick={ensureAudioContextAndWakeLock}
          >
            <Volume2 size={15} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Tap to Unlock Speaker Audio &amp; Keep Screen Awake
          </button>
        </div>
      )}

      {/* Minimalistic Connected Listeners Bar + QR & Room Switcher */}
      <div className="audiosync-top-grid">
        <div className="audiosync-panel">
          <h3>
            <Users size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Connected Listeners ({presenceList.length})
          </h3>
          <div className="audiosync-presence-list">
            {presenceList.length === 0 ? (
              <div className="audiosync-empty">Connecting to room presence...</div>
            ) : (
              presenceList.map((device, idx) => (
                <div key={device.peerId || idx} className="audiosync-presence-row">
                  <div>
                    <strong>{device.display_name || device.displayName || 'Operator'}</strong>
                    <span className="audiosync-presence-role">
                      {' '}
                      ({device.role === 'host' ? 'Host' : 'Listener'})
                    </span>
                  </div>
                  <span
                    className={`status-badge ${
                      device.status === 'Ad Break'
                        ? 'status-mismatch'
                        : device.status === 'Synced' || device.status === 'Host'
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

          <div className="audiosync-room-switcher">
            {role !== 'host' && (
              <button type="button" className="btn" onClick={handleBecomeHost}>
                <Crown size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                Take Host Control
              </button>
            )}
            <button type="button" className="btn" onClick={handleCreatePrivateRoom}>
              <Plus size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              New Private Room
            </button>
            {activeRoom !== LIVE_ROOM_ID && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setVideoId('');
                  setIsPlaying(false);
                  joinChannel(LIVE_ROOM_ID, 'listener');
                }}
              >
                Back to Live Room
              </button>
            )}
          </div>

          <form onSubmit={handleJoinCustomRoom} className="audiosync-join-code-form">
            <input
              type="text"
              value={roomInput}
              onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
              placeholder="Join room code (e.g. SYNC-842K)"
              maxLength={24}
              className="tool-input"
            />
            <button type="submit" className="copy-btn">
              Join
            </button>
          </form>
        </div>

        <div className="audiosync-panel audiosync-qr-panel">
          <h3>Scan to Join Room</h3>
          <div className="audiosync-qr-box">
            <QRCodeSVG
              value={shareUrl}
              size={156}
              bgColor="#ffffff"
              fgColor="#000000"
              level="M"
            />
          </div>
          <div className="audiosync-share-url">{shareUrl}</div>
        </div>
      </div>

      {/* Synchronized YouTube Player */}
      <div className="audiosync-panel">
        <div className="audiosync-yt-header">
          <Tv size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
          <span>YouTube Link Sync</span>
        </div>

        <form onSubmit={handleLoadYouTubeVideo} className="audiosync-yt-form">
          <input
            type="text"
            value={ytInput}
            onChange={(e) => setYtInput(e.target.value)}
            placeholder="Paste YouTube URL (youtube.com/watch?v=..., youtu.be/..., shorts/...) or 11-char video ID"
            className="tool-input"
          />
          <button type="submit" className="btn-tool">
            {role === 'host' ? 'Load Video' : 'Load & Host'}
          </button>
        </form>

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
              onClick={async () => {
                await ensureAudioContextAndWakeLock();
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
                ? 'Paste a YouTube link above to start synchronized multi-device playback.'
                : 'Paste a YouTube link above to host, or wait for the host to start playback.'}
            </div>
          )}
        </div>

        {videoId && (
          <div className="audiosync-controls-row">
            <div className="audiosync-transport">
              {role === 'host' && (
                <button
                  type="button"
                  className="btn"
                  disabled={!ytReady}
                  onClick={() => broadcastYouTubeControl('resync')}
                  title="Schedule playback +1.5s ahead against authoritative server time so every device aligns cleanly"
                >
                  <RefreshCw size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                  Sync Play
                </button>
              )}

              <button
                type="button"
                className={`btn ${isPlaying ? 'btn-autron' : ''}`}
                disabled={role === 'host' && !ytReady}
                onClick={handleUniversalToggle}
                title="Send a universal start/stop signal to everyone in the room"
              >
                {isPlaying ? (
                  <>
                    <Pause size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Universal Pause
                  </>
                ) : (
                  <>
                    <Play size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Universal Play
                  </>
                )}
              </button>

              {role === 'host' && (
                <button
                  type="button"
                  className="btn"
                  disabled={!ytReady}
                  onClick={() => broadcastYouTubeControl('resync', 0)}
                >
                  Restart 0:00
                </button>
              )}
            </div>

            <div className="audiosync-nudge-box">
              <span className="audiosync-nudge-label">Acoustic Echo Micro-Seek:</span>
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
  );
};

export default AudioSync;
