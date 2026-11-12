import {
  editEtappe,
  type Etappe,
  type IntroSettings,
  type OutroSettings,
} from '@travel-route-animator/core';
import { de } from '@/i18n/de';
import { NumberField } from './fields/NumberField';
import { SelectField } from './fields/SelectField';
import { SliderField } from './fields/SliderField';
import { SwitchField } from './fields/SwitchField';
import { useSatelliteAvailable } from './mapStyles';
import { optionsOf, Row, Section } from './parts';
import type { Edit } from './useEdit';

const texts = de.inspector.ends;
const INTROS = ['none', 'overview-to-start', 'dive-out'] as const satisfies IntroSettings['type'][];
const OUTROS = [
  'none',
  'overview',
  'arrival-3d',
  'dive-in',
] as const satisfies OutroSettings['type'][];
const EFFECTS = ['none', 'blur', 'flash', 'fade-white', 'fade-black'] as const;

/** What a type starts with when it is chosen; tuned on the Porto stills (M11). */
function introOf(type: IntroSettings['type']): IntroSettings {
  return type === 'none' ? { type } : { type, durationSec: 2 };
}

function outroOf(type: OutroSettings['type']): OutroSettings {
  switch (type) {
    case 'none':
      return { type };
    case 'overview':
      return { type, durationSec: 2 };
    case 'arrival-3d':
      return { type, durationSec: 4, pitchDeg: 60, orbitDeg: 60 };
    case 'dive-in':
      return {
        type,
        durationSec: 2.5,
        targetZoom: 18,
        switchToSatellite: false,
        effect: 'none',
        exportEndFrame: true,
      };
  }
}

/** How a stage begins and ends (M11): overview, dive-out; overview, 3D arrival, dive-in. */
export function EndsSection({ etappe, edit }: { etappe: Etappe; edit: Edit }) {
  const satellite = useSatelliteAvailable();
  const { intro, outro } = etappe;
  const setIntro = (next: IntroSettings, coalesce = false) =>
    edit('intro', (p) => editEtappe(p, etappe.id, (e) => ({ ...e, intro: next })), { coalesce });
  const setOutro = (next: OutroSettings, coalesce = false) =>
    edit('outro', (p) => editEtappe(p, etappe.id, (e) => ({ ...e, outro: next })), { coalesce });

  return (
    <Section title={texts.title}>
      <Row>
        <SelectField
          label={texts.intro}
          value={intro.type}
          options={optionsOf(INTROS, texts.intros)}
          onCommit={(type) => setIntro(introOf(type))}
        />
        {intro.type !== 'none' && (
          <NumberField
            label={texts.introDuration}
            value={intro.durationSec}
            unit={de.fields.seconds}
            step={0.5}
            onCommit={(durationSec) => setIntro({ ...intro, durationSec }, true)}
          />
        )}
      </Row>
      <Row>
        <SelectField
          label={texts.outro}
          value={outro.type}
          options={optionsOf(OUTROS, texts.outros)}
          onCommit={(type) => setOutro(outroOf(type))}
        />
        {outro.type !== 'none' && (
          <NumberField
            label={texts.outroDuration}
            value={outro.durationSec}
            unit={de.fields.seconds}
            step={0.5}
            onCommit={(durationSec) => setOutro({ ...outro, durationSec }, true)}
          />
        )}
      </Row>
      {outro.type === 'arrival-3d' && (
        <>
          <SliderField
            label={texts.arrivalPitch}
            value={outro.pitchDeg}
            min={20}
            max={80}
            step={1}
            format={(value) => `${value}°`}
            onCommit={(pitchDeg) => setOutro({ ...outro, pitchDeg }, true)}
          />
          <NumberField
            label={texts.orbit}
            value={outro.orbitDeg}
            unit="°"
            step={15}
            hint={texts.orbitHint}
            onCommit={(orbitDeg) => setOutro({ ...outro, orbitDeg }, true)}
          />
          <p className="text-muted-foreground text-xs">{texts.arrivalHint}</p>
        </>
      )}
      {outro.type === 'dive-in' && (
        <>
          <NumberField
            label={texts.targetZoom}
            value={outro.targetZoom}
            step={0.5}
            hint={texts.targetZoomHint}
            onCommit={(targetZoom) => setOutro({ ...outro, targetZoom }, true)}
          />
          <SelectField
            label={texts.effect}
            value={outro.effect}
            options={optionsOf(EFFECTS, texts.effects)}
            onCommit={(effect) => setOutro({ ...outro, effect })}
          />
          <SwitchField
            label={texts.switchToSatellite}
            checked={outro.switchToSatellite}
            disabled={!satellite && !outro.switchToSatellite}
            onCommit={(switchToSatellite) => setOutro({ ...outro, switchToSatellite })}
          />
          <p className="text-muted-foreground text-xs">
            {satellite ? texts.satelliteHint : texts.satelliteOff}
          </p>
          <SwitchField
            label={texts.exportEndFrame}
            checked={outro.exportEndFrame}
            onCommit={(exportEndFrame) => setOutro({ ...outro, exportEndFrame })}
          />
          <p className="text-muted-foreground text-xs">{texts.exportEndFrameHint}</p>
        </>
      )}
    </Section>
  );
}
