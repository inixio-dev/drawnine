export const ExitCode = {
  Ok: 0,
  Usage: 1,
  InvalidDecklist: 2,
  Network: 3,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
