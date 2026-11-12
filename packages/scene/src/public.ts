// What the editor uses of the scene: the same composition the export renders. The caller has
// to set MapLibre's worker URL before the first map is created (see index.ts for why).
export { EtappeComposition, timelineOf, type EtappeProps } from './compositions/EtappeComposition';
export { SequenceComposition, sequenceOf } from './compositions/SequenceComposition';
export type { SequenceProps } from './compositions/etappeProps';
