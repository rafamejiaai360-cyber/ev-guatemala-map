import { Composition } from 'remotion';
import { EncuentraCargador, TOTAL } from './EncuentraCargador';

export const Root = () => (
  <Composition
    id="EncuentraCargador"
    component={EncuentraCargador}
    durationInFrames={TOTAL}
    fps={30}
    width={1080}
    height={1920}
  />
);
