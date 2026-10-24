import { Composition } from 'remotion';
import { ModoRuta, TOTAL } from './ModoRuta';

export const Root = () => (
  <Composition
    id="ModoRuta"
    component={ModoRuta}
    durationInFrames={TOTAL}
    fps={30}
    width={1080}
    height={1920}
  />
);
