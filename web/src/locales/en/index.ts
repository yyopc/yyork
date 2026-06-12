import 'dayjs/locale/en.js';

import common from './common.json' with { type: 'json' };
import components from './components.json' with { type: 'json' };

export default {
  common,
  components,
} as const;
