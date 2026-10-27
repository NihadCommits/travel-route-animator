import type { CallbackListener, PlayerRef } from '@remotion/player';
import type { Id } from '@travel-route-animator/core';
import { createContext, useContext, useSyncExternalStore } from 'react';

/** The preview's player while it is open, with what the timeline needs to know about it. */
export interface AttachedPlayer {
  etappeId: Id;
  player: PlayerRef;
  fps: number;
  durationInFrames: number;
}

/**
 * Preview and timeline sit in different panels but show the same moment. The bridge connects
 * them: the preview hands over its player, the timeline follows its frame and seeks with it.
 * It stays out of the editor store on purpose: the frame changes up to 60 times a second, and
 * only the playhead and the time display need to know.
 *
 * The frame is kept per stage also while the preview is closed. The playhead stays where it
 * was, a click on the ruler in edit mode moves it, and the preview opens there.
 */
export interface PlayerBridge {
  subscribe: (listener: () => void) => () => void;
  attached: () => AttachedPlayer | null;
  /** Called by the preview; returns the matching detach. */
  attach: (attached: AttachedPlayer) => () => void;
  frameOf: (etappeId: Id) => number;
  isPlaying: () => boolean;
  /** Jumps there in the player if it shows this stage, otherwise for when it opens. */
  seek: (etappeId: Id, frame: number) => void;
  togglePlay: () => void;
  /** Pauses and moves by a number of frames, staying inside the video. */
  step: (frames: number) => void;
}

export function createPlayerBridge(): PlayerBridge {
  const listeners = new Set<() => void>();
  const frames = new Map<Id, number>();
  let current: AttachedPlayer | null = null;
  let playing = false;
  const notify = () => listeners.forEach((listener) => listener());

  function seek(etappeId: Id, frame: number) {
    const target = Math.max(0, Math.round(frame));
    if (current?.etappeId === etappeId) {
      current.player.seekTo(Math.min(target, current.durationInFrames - 1));
    } else {
      frames.set(etappeId, target);
      notify();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    attached: () => current,
    attach(attached) {
      const { player, etappeId } = attached;
      const onFrame: CallbackListener<'frameupdate'> = ({ detail }) => {
        frames.set(etappeId, detail.frame);
        notify();
      };
      const onPlay = () => {
        playing = true;
        notify();
      };
      const onPause = () => {
        playing = false;
        notify();
      };
      player.addEventListener('frameupdate', onFrame);
      player.addEventListener('play', onPlay);
      player.addEventListener('pause', onPause);
      current = attached;
      playing = player.isPlaying();
      frames.set(etappeId, player.getCurrentFrame());
      notify();
      return () => {
        player.removeEventListener('frameupdate', onFrame);
        player.removeEventListener('play', onPlay);
        player.removeEventListener('pause', onPause);
        if (current === attached) {
          current = null;
          playing = false;
          notify();
        }
      };
    },
    frameOf: (etappeId) => frames.get(etappeId) ?? 0,
    isPlaying: () => playing,
    seek,
    togglePlay: () => current?.player.toggle(),
    step(by) {
      if (!current) return;
      current.player.pause();
      seek(current.etappeId, current.player.getCurrentFrame() + by);
    },
  };
}

export const PlayerBridgeContext = createContext<PlayerBridge | null>(null);

export function usePlayerBridge(): PlayerBridge {
  const bridge = useContext(PlayerBridgeContext);
  if (!bridge) throw new Error('usePlayerBridge must be used inside the editor layout');
  return bridge;
}

/** Where the preview of this stage stands; re-renders on every frame, so keep the user small. */
export function usePreviewFrame(etappeId: Id): number {
  const bridge = usePlayerBridge();
  return useSyncExternalStore(bridge.subscribe, () => bridge.frameOf(etappeId));
}

export function usePreviewPlaying(): boolean {
  const bridge = usePlayerBridge();
  return useSyncExternalStore(bridge.subscribe, bridge.isPlaying);
}

export function useAttachedPlayer(): AttachedPlayer | null {
  const bridge = usePlayerBridge();
  return useSyncExternalStore(bridge.subscribe, bridge.attached);
}
