import { useState } from 'react';

const DAYS_STEP = 7;
const REFRESH_MS = 60000;

// The date filter and day paging behind every "records by day" screen.
// Refreshed so someone checking out, or a period closing by itself, shows up
// without a reload.
export default function useAttendanceDays(useQuery) {
  const [range, setRangeState] = useState({ from: '', to: '' });
  const [days, setDays] = useState(DAYS_STEP);
  const { data, currentData, isLoading } = useQuery({ ...range, days }, { pollingInterval: REFRESH_MS });

  const setRange = (next) => {
    setRangeState(next);
    setDays(DAYS_STEP);
  };

  return {
    range,
    setRange,
    records: data?.records || [],
    isLoading,
    hasMore: !!data?.hasMore,
    // `currentData` is empty only while the newly asked-for days are on their way
    loadingMore: !!data && !currentData,
    showMore: () => setDays((n) => n + DAYS_STEP),
  };
}
