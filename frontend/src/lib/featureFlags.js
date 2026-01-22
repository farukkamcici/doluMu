const TRUE_VALUES = new Set(['1', 'true', 't', 'yes', 'y', 'on']);

const parseBool = (value, defaultValue = false) => {
  if (value == null) return defaultValue;
  return TRUE_VALUES.has(String(value).trim().toLowerCase());
};

export const isMetroTimetableDisabled = () => {
  return parseBool(process.env.NEXT_PUBLIC_METRO_TIMETABLE_DISABLED, false);
};

