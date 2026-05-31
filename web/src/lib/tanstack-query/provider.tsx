import { QueryClientProvider as Provider } from '@tanstack/react-query';
import { ReactNode } from 'react';

import { SessionEventsSubscriber } from '@/features/home/data/session-events-subscriber';

import { queryClient } from './query-client';

export const QueryClientProvider = (props: { children?: ReactNode }) => {
  return (
    <Provider client={queryClient}>
      <SessionEventsSubscriber />
      {props.children}
    </Provider>
  );
};
