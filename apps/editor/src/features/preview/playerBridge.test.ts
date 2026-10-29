import type { PlayerRef } from '@remotion/player';
import { describe, expect, it, vi } from 'vitest';
import { createPlayerBridge } from './playerBridge';

type Listener = (event: { detail: { frame: number } }) => void;

/** Just enough of Remotion's PlayerRef: a frame, play state and the events the bridge uses. */
function fakePlayer(frame = 0) {
  const listeners = new Map<string, Set<Listener>>();
  const state = { frame, playing: false };
  const emit = (name: string, detail?: { frame: number }) =>
    listeners.get(name)?.forEach((listener) => listener({ detail: detail! }));
  const player = {
    addEventListener: (name: string, listener: Listener) =>
      listeners.set(name, (listeners.get(name) ?? new Set()).add(listener)),
    removeEventListener: (name: string, listener: Listener) =>
      listeners.get(name)?.delete(listener),
    getCurrentFrame: () => state.frame,
    isPlaying: () => state.playing,
    seekTo: vi.fn((to: number) => {
      state.frame = to;
      emit('frameupdate', { frame: to });
    }),
    pause: vi.fn(() => {
      state.playing = false;
      emit('pause');
    }),
    toggle: vi.fn(() => {
      state.playing = !state.playing;
      emit(state.playing ? 'play' : 'pause');
    }),
  };
  return { player: player as unknown as PlayerRef, mock: player, emit, listeners };
}

describe('createPlayerBridge', () => {
  it('keeps the frame of a stage while its preview is closed', () => {
    const bridge = createPlayerBridge();
    const notified = vi.fn();
    bridge.subscribe(notified);
    bridge.seek('e_1', 40.4);
    expect(bridge.frameOf('e_1')).toBe(40);
    expect(bridge.frameOf('e_2')).toBe(0);
    expect(notified).toHaveBeenCalledOnce();
  });

  it('seeks in the open preview, inside the video, and follows its frames', () => {
    const bridge = createPlayerBridge();
    const { player, mock, emit } = fakePlayer(12);
    bridge.attach({ etappeId: 'e_1', player, fps: 25, durationInFrames: 101 });
    expect(bridge.frameOf('e_1')).toBe(12);

    bridge.seek('e_1', 500);
    expect(mock.seekTo).toHaveBeenLastCalledWith(100);
    emit('frameupdate', { frame: 57 });
    expect(bridge.frameOf('e_1')).toBe(57);
    // Another stage's frame is only remembered.
    bridge.seek('e_2', 5);
    expect(mock.seekTo).toHaveBeenCalledTimes(1);
  });

  it('pauses before stepping and knows whether it plays', () => {
    const bridge = createPlayerBridge();
    const { player, mock } = fakePlayer(10);
    bridge.attach({ etappeId: 'e_1', player, fps: 25, durationInFrames: 101 });
    bridge.togglePlay();
    expect(bridge.isPlaying()).toBe(true);

    bridge.step(-25);
    expect(mock.pause).toHaveBeenCalled();
    expect(bridge.isPlaying()).toBe(false);
    expect(mock.seekTo).toHaveBeenLastCalledWith(0);
  });

  it('lets go of the player and its events when the preview closes', () => {
    const bridge = createPlayerBridge();
    const { player, listeners } = fakePlayer();
    const detach = bridge.attach({ etappeId: 'e_1', player, fps: 25, durationInFrames: 101 });
    detach();
    expect(bridge.attached()).toBeNull();
    expect([...listeners.values()].every((set) => set.size === 0)).toBe(true);
    // Nothing to step or play without a preview.
    expect(() => bridge.step(1)).not.toThrow();
  });
});
