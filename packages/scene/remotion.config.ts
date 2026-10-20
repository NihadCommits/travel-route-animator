// Read by Remotion Studio and the Remotion CLI when started inside packages/scene.
import { Config } from '@remotion/cli/config';
import { webpackOverride } from './webpack-override';

Config.overrideWebpackConfig(webpackOverride);
