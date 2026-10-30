import { mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DesktopSettings, DesktopSettingsPatch } from '@travel-route-animator/core';
import { GL_RENDERERS, type OpenGlRenderer } from '@travel-route-animator/scene/render/gl';
import { writeFileAtomic } from '@travel-route-animator/server/files';
import { z } from 'zod';

/**
 * Encryption of the openrouteservice key. main.ts passes Electron's safeStorage, which uses
 * Windows' own user-bound encryption (DPAPI); tests pass a fake.
 */
export interface KeyVault {
  isAvailable: () => boolean;
  encrypt: (plain: string) => Buffer;
  decrypt: (sealed: Buffer) => string;
}

// What settings.json holds. The key only ever encrypted, as base64.
const StoredSettingsSchema = z.object({
  orsApiKeySealed: z.string().optional(),
  serviceContact: z.string().optional(),
  outputDir: z.string().optional(),
  renderGl: z.string().optional(),
  /** The first start asked whether to bring in existing projects. */
  importOffered: z.boolean().optional(),
});
type StoredSettings = z.infer<typeof StoredSettingsSchema>;

/** The settings in the form the server's start-up needs them. */
export interface EffectiveSettings {
  orsApiKey: string | undefined;
  serviceContact: string;
  outputDir: string;
  renderGl: OpenGlRenderer;
}

export class SettingsError extends Error {
  override name = 'SettingsError';
}

export function createSettingsStore({
  file,
  vault,
  defaultOutputDir,
  dataDir,
}: {
  file: string;
  vault: KeyVault;
  defaultOutputDir: string;
  dataDir: string;
}) {
  let stored: StoredSettings = {};

  async function save() {
    await mkdir(dirname(file), { recursive: true });
    await writeFileAtomic(file, `${JSON.stringify(stored, null, 2)}\n`);
  }

  function openKey(): string | undefined {
    if (!stored.orsApiKeySealed || !vault.isAvailable()) return undefined;
    try {
      return vault.decrypt(Buffer.from(stored.orsApiKeySealed, 'base64'));
    } catch {
      // Sealed for another Windows user or machine: as if there were none.
      return undefined;
    }
  }

  function effective(): EffectiveSettings {
    const renderGl = GL_RENDERERS.find((gl) => gl === stored.renderGl) ?? 'angle';
    return {
      orsApiKey: openKey(),
      serviceContact: stored.serviceContact ?? '',
      outputDir: stored.outputDir ?? defaultOutputDir,
      renderGl,
    };
  }

  return {
    /** Reads settings.json; a missing or broken file starts with the defaults. */
    async load(): Promise<void> {
      try {
        const parsed = StoredSettingsSchema.safeParse(JSON.parse(await readFile(file, 'utf8')));
        stored = parsed.success ? parsed.data : {};
      } catch {
        stored = {};
      }
    },
    effective,
    /** For the window: everything but the key itself. */
    forWindow(): DesktopSettings {
      const { orsApiKey, ...rest } = effective();
      return {
        ...rest,
        orsApiKeySet: orsApiKey !== undefined,
        defaultOutputDir,
        dataDir,
        renderGlOptions: [...GL_RENDERERS],
      };
    },
    async update(patch: DesktopSettingsPatch): Promise<void> {
      const next = { ...stored };
      if (patch.orsApiKey !== undefined) {
        const key = patch.orsApiKey?.trim();
        if (!key) delete next.orsApiKeySealed;
        else {
          if (!vault.isAvailable()) {
            throw new SettingsError('Windows cannot encrypt the key on this account');
          }
          next.orsApiKeySealed = vault.encrypt(key).toString('base64');
        }
      }
      if (patch.serviceContact !== undefined) next.serviceContact = patch.serviceContact.trim();
      if (patch.outputDir !== undefined) {
        if (patch.outputDir === null) delete next.outputDir;
        else next.outputDir = patch.outputDir;
      }
      if (patch.renderGl !== undefined) {
        if (!GL_RENDERERS.some((gl) => gl === patch.renderGl)) {
          throw new SettingsError(`Unknown OpenGL backend "${patch.renderGl}"`);
        }
        next.renderGl = patch.renderGl;
      }
      stored = next;
      await save();
    },
    importOffered: () => stored.importOffered === true,
    async markImportOffered(): Promise<void> {
      stored = { ...stored, importOffered: true };
      await save();
    },
  };
}

export type SettingsStore = ReturnType<typeof createSettingsStore>;
