/**
 * ORBIT ZERO: THE LAST DOWNLINK
 * Master Landing Experience Controller (RC9.2 Polish)
 *
 * Coordinates:
 * 1. LandingScene (Photorealistic 3D Earth, rotating clouds, satellite, 4K Milky Way space)
 * 2. LandingUI (Military/aerospace tactical operations interface, mode selection)
 * 3. LandingAudioController (Voice-over, procedural space drone, immediate auto-unlock on first touch)
 *
 * Implements clean lifecycle transitions and complete resource disposal prior to launching
 * the core RC8/RC9 IWSDK game engine.
 */

import { LandingAudioController } from './landingAudio';
import { LandingScene } from './landingScene';
import { LandingUI } from './landingUI';

export type LaunchGameCallback = (launchXR: boolean) => unknown | Promise<unknown>;

export class LandingController {
  private container: HTMLElement;
  private onLaunchGame: LaunchGameCallback;

  private scene: LandingScene | null = null;
  private ui: LandingUI | null = null;
  private audio: LandingAudioController | null = null;
  private isTransitioning = false;

  private onFirstInteractionBound: () => void;

  constructor(container: HTMLElement, onLaunchGame: LaunchGameCallback) {
    this.container = container;
    this.onLaunchGame = onLaunchGame;

    this.audio = new LandingAudioController();
    this.scene = new LandingScene(this.container);

    this.ui = new LandingUI(this.container, {
      onEnterExperience: () => this.handleEnterExperience(),
      onPlayDesktop: () => this.handleLaunch(false),
      onEnterVR: () => this.handleLaunch(true),
      onToggleMute: () => this.handleToggleMute(),
      onBackToOrbit: () => this.handleBackToOrbit(),
    });

    // Auto-sound strategy: Attempt immediate play on page load
    this.audio.unlockAudio().catch(() => {});

    // Ensure audio starts immediately on the VERY FIRST touch/click/keypress anywhere on screen
    this.onFirstInteractionBound = () => {
      if (this.audio) {
        this.audio.unlockAudio().catch(() => {});
      }
      this.detachFirstInteractionListeners();
    };

    window.addEventListener('pointerdown', this.onFirstInteractionBound, { capture: true });
    window.addEventListener('keydown', this.onFirstInteractionBound, { capture: true });
    window.addEventListener('touchstart', this.onFirstInteractionBound, { capture: true });
  }

  private detachFirstInteractionListeners(): void {
    window.removeEventListener('pointerdown', this.onFirstInteractionBound, { capture: true });
    window.removeEventListener('keydown', this.onFirstInteractionBound, { capture: true });
    window.removeEventListener('touchstart', this.onFirstInteractionBound, { capture: true });
  }

  private async handleEnterExperience(): Promise<void> {
    if (this.audio) {
      await this.audio.unlockAudio();
      this.audio.playUiChime(960);
    }
  }

  private handleBackToOrbit(): void {
    if (this.audio) {
      this.audio.playUiChime(640);
    }
  }

  private handleToggleMute(): boolean {
    if (!this.audio) return true;
    return this.audio.toggleMute();
  }

  private async handleLaunch(launchXR: boolean): Promise<void> {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    if (this.audio) {
      this.audio.playUiChime(1200);
      this.audio.playTransitionWhoosh();
    }

    // Smooth camera push-in towards orbital perspective
    if (this.scene) {
      try {
        await this.scene.playTransitionToOrbit();
      } catch {
        // Fallthrough if animation is interrupted
      }
    }

    // Complete cleanup and disposal of landing WebGL & DOM resources
    this.dispose();

    // Hand over control to the core game engine
    try {
      await this.onLaunchGame(launchXR);
    } catch (err) {
      console.error('[LandingController] Failed to launch game:', err);
    }
  }

  public dispose(): void {
    this.detachFirstInteractionListeners();

    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }

    if (this.ui) {
      this.ui.dispose();
      this.ui = null;
    }

    if (this.audio) {
      this.audio.dispose();
      this.audio = null;
    }
  }
}
