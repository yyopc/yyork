import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default {
  title: 'DatePicker',
};

const defaultCalendarMonth = new Date(2026, 0, 1);

export const Default = () => {
  const [date, setDate] = useState<Date | null>();

  return <DatePicker onChange={(value) => setDate(value)} value={date} />;
};

export const CalendarCustomization = () => {
  const [date, setDate] = useState<Date | null>();

  return (
    <DatePicker
      onChange={(value) => setDate(value)}
      value={date}
      calendarProps={{
        startMonth: defaultCalendarMonth,
        endMonth: defaultCalendarMonth,
      }}
    />
  );
};

export const NoCalendar = () => {
  const [date, setDate] = useState<Date | null>();

  return (
    <DatePicker onChange={(value) => setDate(value)} value={date} noCalendar />
  );
};

export const InDialog = () => {
  const [date, setDate] = useState<Date | null>();

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" />}>
        Open
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Birthday</DialogTitle>
          <DialogDescription>Choose a date</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <DatePicker onChange={(value) => setDate(value)} value={date} />
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
