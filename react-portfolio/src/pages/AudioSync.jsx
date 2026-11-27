import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSearchParams } from 'react-router-dom';
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
  RefreshCw,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/useAuth';

const YOUTUBE_CONTAINER_ID = 'audiosync-yt-player';
const YT_VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;
const ROOM_CODE_REGEX = /^[A-Z0-9-]{3,24}$/;
const DEFAULT_PLAY_LEAD_MS = 1400;
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

  const rawTime = payload.targetTime !== undefined ? payload.targetTime : payload.hostTime;
  const targetTime = Number(rawTime);
  const serverTimestamp = Number(payload.serverTimestamp);
  if (!Number.isFinite(targetTime) || targetTime < 0) return null;
  if (!Number.isFinite(serverTimestamp) || serverTimestamp <= 0) return null;

  const executeAt =
    payload.executeAt !== undefined ? Number(payload.executeAt) : undefined;
  if (executeAt !== undefined && !Number.isFinite(executeAt)) return null;

  return {
    videoId: payload.videoId,
    targetTime,
    serverTimestamp,
    isPlaying: Boolean(payload.isPlaying),
    executeAt,
    preBuffered: Boolean(payload.preBuffered),
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

  // YouTube Sync state & live telemetry
  const [ytInput, setYtInput] = useState('');
  const [videoId, setVideoId] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [nudgeOffsetMs, setNudgeOffsetMs] = useState(0);
  const [adBreakActive, setAdBreakActive] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [telemetry, setTelemetry] = useState({ rttMs: null, driftMs: null, rate: 1 });

  // Refs for strict lifecycle & cleanup
  const channelRef = useRef(null);
  const ytPlayerRef = useRef(null);
  const audioCtxRef = useRef(null);
  const wakeLockRef = useRef(null);

  const heartbeatIntervalRef = useRef(null);
  const driftLoopIntervalRef = useRef(null);
  const clockRecalIntervalRef = useRef(null);
  const scheduledActionTimeoutRef = useRef(null);
  const clockPingTimersRef = useRef([]);

  const clockOffsetMsRef = useRef(0);
  const bestRttMsRef = useRef(Infinity);
  const lastSeekAtRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const prevPlayerTimeRef = useRef(null);
  const latestSyncRef = useRef(null);
  const adBreakRef = useRef(false);
  const nudgeOffsetMsRef = useRef(0);
  const activeRoomRef = useRef('');
  const roleRef = useRef(null);
  const videoIdRef = useRef('');
  const isPlayingRef = useRef(false);
  const applyListenerSyncRef = useRef(null);
  const hostControlFnRef = useRef(null);
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

  // Converts local wall-clock time to Host wall-clock time
  const getServerNow = useCallback(() => Date.now() + clockOffsetMsRef.current, []);

  // Compute expected Host video position right now using latest authoritative sync packet
  const computeExpectedVideoTime = useCallback(
    (syncPayload) => {
      if (!syncPayload) return 0;
      const serverNow = getServerNow();
      if (!syncPayload.isPlaying) {
        return Math.max(0, syncPayload.targetTime + nudgeOffsetMsRef.current / 1000);
      }
      // Reference clock is executeAt if pre-buffered start, otherwise serverTimestamp
      const refTimeMs =
        syncPayload.preBuffered && syncPayload.executeAt
          ? syncPayload.executeAt
          : syncPayload.serverTimestamp;
      const elapsedSec = Math.max(0, (serverNow - refTimeMs) / 1000);
      return Math.max(
        0,
        syncPayload.targetTime + elapsedSec + nudgeOffsetMsRef.current / 1000
      );
    },
    [getServerNow]
  );

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

  const cleanupRoomResources = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (driftLoopIntervalRef.current) {
      clearInterval(driftLoopIntervalRef.current);
      driftLoopIntervalRef.current = null;
    }
    if (clockRecalIntervalRef.current) {
      clearInterval(clockRecalIntervalRef.current);
      clockRecalIntervalRef.current = null;
    }
    if (scheduledActionTimeoutRef.current) {
      clearTimeout(scheduledActionTimeoutRef.current);
      scheduledActionTimeoutRef.current = null;
    }
    clockPingTimersRef.current.forEach((t) => clearTimeout(t));
    clockPingTimersRef.current = [];

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

    bestRttMsRef.current = Infinity;
    clockOffsetMsRef.current = 0;
    lastSeekAtRef.current = 0;
    lastProgressAtRef.current = Date.now();
    latestSyncRef.current = null;
    prevPlayerTimeRef.current = null;
    adBreakRef.current = false;
    setAdBreakActive(false);
    setNeedsPlayTap(false);
    setTelemetry({ rttMs: null, driftMs: null, rate: 1 });
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
                  channelRef.current.send({
                    type: 'broadcast',
                    event: 'yt-control',
                    payload: {
                      videoId: videoIdRef.current,
                      targetTime: hostTime,
                      serverTimestamp: Date.now(),
                      isPlaying: nowPlaying,
                      executeAt: Date.now(),
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

  // Apply host sync command on speaker with exact pre-buffered future executeAt math
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

      // Always reset playbackRate before applying a control jump
      player.setPlaybackRate?.(1);

      // Universal Stop / Pause: pause immediately and lock onto exact paused timestamp
      if (!payload.isPlaying) {
        player.pauseVideo?.();
        const target = Math.max(0, payload.targetTime + nudgeOffsetMsRef.current / 1000);
        const current = player.getCurrentTime?.() || 0;
        if (Math.abs(current - target) > 0.15) {
          lastSeekAtRef.current = Date.now();
          player.seekTo(target, true);
          player.pauseVideo?.();
        }
        setNeedsPlayTap(false);
        setTelemetry((prev) => ({ ...prev, driftMs: 0, rate: 1 }));
        updatePresenceStatus('Paused');
        return;
      }

      const startAtTarget = () => {
        const p = ytPlayerRef.current;
        if (!p || typeof p.seekTo !== 'function') return;

        const expectedNow = computeExpectedVideoTime(payload);
        const current = p.getCurrentTime?.() || 0;
        // Only seek if we aren't already sitting right on the pre-buffered target frame
        if (Math.abs(current - expectedNow) > 0.2) {
          lastSeekAtRef.current = Date.now();
          p.seekTo(expectedNow + SEEK_BUFFER_LEAD_SEC, true);
        }
        p.setPlaybackRate?.(1);
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

      const delayMs =
        !forceImmediate && payload.executeAt ? payload.executeAt - getServerNow() : 0;

      if (delayMs > 60) {
        // Pre-seek and hold paused while buffering so playVideo() fires at exact executeAt
        const preTarget = Math.max(0, payload.targetTime + nudgeOffsetMsRef.current / 1000);
        lastSeekAtRef.current = Date.now();
        player.seekTo(preTarget, true);
        player.pauseVideo?.();
        updatePresenceStatus('Syncing');
        scheduledActionTimeoutRef.current = setTimeout(startAtTarget, delayMs);
      } else {
        startAtTarget();
      }
    },
    [computeExpectedVideoTime, getServerNow, updatePresenceStatus]
  );

  useEffect(() => {
    applyListenerSyncRef.current = applyListenerSync;
  }, [applyListenerSync]);

  // Host authoritative 2-second heartbeat
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
          targetTime: hostTime,
          serverTimestamp: Date.now(),
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

  // Speaker 500ms smooth playbackRate catch-up & Ad-Break recovery loop
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

      // Do not fight a scheduled pre-buffered start
      if (scheduledActionTimeoutRef.current) return;

      const expectedTime = computeExpectedVideoTime(sync);
      const actualTime = player.getCurrentTime() || 0;
      // Positive signedDrift = speaker is BEHIND host; negative = speaker is AHEAD of host
      const signedDrift = expectedTime - actualTime;
      const absDrift = Math.abs(signedDrift);

      const prevTime = prevPlayerTimeRef.current;
      prevPlayerTimeRef.current = actualTime;

      if (prevTime !== null && Math.abs(actualTime - prevTime) >= 0.15) {
        lastProgressAtRef.current = Date.now();
      }

      const playerState = player.getPlayerState?.();
      const ytPlayingState = window.YT?.PlayerState?.PLAYING ?? 1;
      const seekCooldownActive = Date.now() - lastSeekAtRef.current < 2200;

      setTelemetry((prev) => ({
        ...prev,
        driftMs: Math.round(signedDrift * 1000),
      }));

      if (!adBreakRef.current) {
        if (lastProgressAtRef.current === 0) {
          lastProgressAtRef.current = Date.now();
        }
        // Ad freeze detection: video stalled > 2.2s while host clock kept advancing
        if (Date.now() - lastProgressAtRef.current >= 2200 && absDrift > 1.5) {
          adBreakRef.current = true;
          setAdBreakActive(true);
          player.setPlaybackRate?.(1);
          player.mute?.();
          updatePresenceStatus('Ad Break');
          return;
        }

        if (playerState !== ytPlayingState) return;

        if (absDrift > 1.25 && !seekCooldownActive) {
          // Large jump needed: add seek-buffer lead compensation
          lastSeekAtRef.current = Date.now();
          player.setPlaybackRate?.(1);
          player.seekTo(expectedTime + SEEK_BUFFER_LEAD_SEC, true);
          setTelemetry((prev) => ({ ...prev, rate: 1 }));
        } else if (absDrift > 0.12 && !seekCooldownActive) {
          // Smooth micro-catchup without triggering YouTube re-buffering!
          const targetRate = signedDrift > 0 ? 1.25 : 0.75;
          if (player.getPlaybackRate?.() !== targetRate) {
            player.setPlaybackRate?.(targetRate);
            setTelemetry((prev) => ({ ...prev, rate: targetRate }));
          }
        } else if (player.getPlaybackRate?.() !== 1) {
          player.setPlaybackRate?.(1);
          setTelemetry((prev) => ({ ...prev, rate: 1 }));
        }
      } else if (
        prevTime !== null &&
        actualTime - prevTime >= 0.15 &&
        playerState === ytPlayingState
      ) {
        // Ad ended: snap back with seek-buffer compensation and unmute
        adBreakRef.current = false;
        setAdBreakActive(false);
        lastSeekAtRef.current = Date.now();
        player.setPlaybackRate?.(1);
        player.seekTo(expectedTime + SEEK_BUFFER_LEAD_SEC, true);
        player.unMute?.();
        setTelemetry((prev) => ({ ...prev, rate: 1 }));
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

  // Host authoritative Sync Play / Universal Pause / Restart controller
  const broadcastYouTubeControl = useCallback(
    (actionMode, explicitTime) => {
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

      const now = Date.now();

      // UNIVERSAL PAUSE: instant stop across host and every speaker
      if (actionMode === 'pause') {
        channelRef.current.send({
          type: 'broadcast',
          event: 'yt-control',
          payload: {
            videoId: videoIdRef.current,
            targetTime: currentHostTime,
            serverTimestamp: now,
            isPlaying: false,
            executeAt: now,
            preBuffered: false,
          },
        });
        setIsPlaying(false);
        isPlayingRef.current = false;
        if (player) {
          hostManualSyncBlockRef.current = true;
          if (explicitTime !== undefined) {
            player.seekTo?.(explicitTime, true);
          }
          player.pauseVideo?.();
          setTimeout(() => {
            hostManualSyncBlockRef.current = false;
          }, 400);
        }
        return;
      }

      // SYNC PLAY / UNIVERSAL PLAY:
      // Calculate latency lead so all speakers pre-buffer targetTime before executeAt.
      const leadMs = Math.max(DEFAULT_PLAY_LEAD_MS, Math.round((bestRttMsRef.current || 0) + 900));
      const executeAt = now + leadMs;
      const hostCurrentlyPlaying =
        explicitTime === undefined &&
        actionMode === 'resync' &&
        window.YT?.PlayerState &&
        player?.getPlayerState?.() === window.YT.PlayerState.PLAYING;

      // If host is already playing and user clicked Sync Play to realign drifted speakers,
      // project targetTime forward by leadMs so host reaches targetTime naturally at executeAt!
      const targetTime = hostCurrentlyPlaying
        ? currentHostTime + leadMs / 1000
        : currentHostTime;

      channelRef.current.send({
        type: 'broadcast',
        event: 'yt-control',
        payload: {
          videoId: videoIdRef.current,
          targetTime,
          serverTimestamp: now,
          isPlaying: true,
          executeAt,
          preBuffered: true,
        },
      });

      setIsPlaying(true);
      isPlayingRef.current = true;

      if (player) {
        hostManualSyncBlockRef.current = true;
        if (!hostCurrentlyPlaying) {
          player.seekTo?.(targetTime, true);
          player.pauseVideo?.();
          scheduledActionTimeoutRef.current = setTimeout(() => {
            ytPlayerRef.current?.playVideo?.();
            setTimeout(() => {
              hostManualSyncBlockRef.current = false;
            }, 500);
          }, leadMs);
        } else {
          // Host keeps playing smoothly toward targetTime
          setTimeout(() => {
            hostManualSyncBlockRef.current = false;
          }, 500);
        }
      }
    },
    []
  );

  useEffect(() => {
    hostControlFnRef.current = broadcastYouTubeControl;
  }, [broadcastYouTubeControl]);

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
        if (rtt <= bestRttMsRef.current + 20) {
          bestRttMsRef.current = Math.min(bestRttMsRef.current, rtt);
          clockOffsetMsRef.current = hostNow + rtt / 2 - Date.now();
          setTelemetry((prev) => ({ ...prev, rttMs: Math.round(rtt) }));
        }
        if (roleRef.current === 'listener' && !latestSyncRef.current) {
          updatePresenceStatus('Standby');
        }
      });

      const sendClockPingBurst = () => {
        clockPingTimersRef.current.forEach((t) => clearTimeout(t));
        clockPingTimersRef.current = [0, 200, 450, 750].map((delay) =>
          setTimeout(() => {
            channel.send({
              type: 'broadcast',
              event: 'clock-ping',
              payload: { fromPeerId: peerId, clientSentAt: Date.now() },
            });
          }, delay)
        );
      };

      channel.on('broadcast', { event: 'host-ready' }, () => {
        if (roleRef.current !== 'listener') return;
        bestRttMsRef.current = Infinity;
        sendClockPingBurst();
        channel.send({
          type: 'broadcast',
          event: 'peer-join',
          payload: { peerId, displayName },
        });
      });

      // Allow universal pause/play trigger from any speaker in the room via host
      channel.on('broadcast', { event: 'universal-signal' }, ({ payload }) => {
        if (roleRef.current !== 'host' || !payload) return;
        if (payload.command === 'pause') {
          hostControlFnRef.current?.('pause');
        } else if (payload.command === 'play') {
          hostControlFnRef.current?.('resync');
        }
      });

      channel.on('broadcast', { event: 'yt-control' }, ({ payload }) => {
        const sanitized = sanitizeSyncPayload(payload);
        if (!sanitized) return;
        applyListenerSync(sanitized, !sanitized.isPlaying);
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
        if (scheduledActionTimeoutRef.current) return;

        if (!sanitized.isPlaying) {
          player.setPlaybackRate?.(1);
          player.pauseVideo?.();
          const current = player.getCurrentTime() || 0;
          const target = Math.max(0, sanitized.targetTime + nudgeOffsetMsRef.current / 1000);
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
            event: 'yt-heartbeat',
            payload: {
              videoId: videoIdRef.current,
              targetTime: hostTime,
              serverTimestamp: Date.now(),
              isPlaying: isPlayingRef.current,
              preBuffered: false,
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
            sendClockPingBurst();
            channel.send({
              type: 'broadcast',
              event: 'peer-join',
              payload: { peerId, displayName },
            });
            // Periodic clock recalibration every 10s
            clockRecalIntervalRef.current = setInterval(() => {
              channel.send({
                type: 'broadcast',
                event: 'clock-ping',
                payload: { fromPeerId: peerId, clientSentAt: Date.now() },
              });
            }, 10000);
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
      computeExpectedVideoTime,
      displayName,
      ensureAudioContext,
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

  const handleUniversalToggle = () => {
    const nextCmd = isPlaying ? 'pause' : 'play';
    if (role === 'host') {
      broadcastYouTubeControl(nextCmd);
      return;
    }
    // Speaker requests room-wide start/stop through authoritative host clock
    channelRef.current?.send({
      type: 'broadcast',
      event: 'universal-signal',
      payload: { command: nextCmd, fromPeerId: peerId },
    });
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
          targetTime: 0,
          serverTimestamp: Date.now(),
          isPlaying: false,
          executeAt: Date.now(),
          preBuffered: false,
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
    lastSeekAtRef.current = Date.now();
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
          Synchronize YouTube playback across phones and laptops in real time using latency-compensated timestamps, smooth speed-matching, and universal room controls.
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
                {role === 'listener' && telemetry.rttMs !== null && (
                  <span className="audiosync-wakelock-pill">
                    RTT: {telemetry.rttMs}ms
                    {telemetry.driftMs !== null ? ` | DRIFT: ${telemetry.driftMs > 0 ? '+' : ''}${telemetry.driftMs}ms` : ''}
                    {telemetry.rate !== 1 ? ` | ${telemetry.rate}x` : ''}
                  </span>
                )}
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
                <div className="audiosync-transport">
                  {role === 'host' && (
                    <button
                      type="button"
                      className="btn"
                      disabled={!ytReady}
                      onClick={() => broadcastYouTubeControl('resync')}
                      title="Broadcast exact future timestamp with latency compensation so everyone re-syncs cleanly"
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
                    title="Send a universal start/stop signal to every device in the room"
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
