import type { z } from 'zod';
import { formatPath, ProjectSchema, type Project } from './project';

export interface ValidationIssue {
  /** Where the problem is, e.g. groups[0].etappen[1].tracks[0].waypoints[0].lngLat[1] */
  path: string;
  message: string;
}

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; issues: ValidationIssue[] };

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: formatPath(issue.path),
    message: issue.message,
  }));
}

export function validateProject(input: unknown): ValidationResult<Project> {
  const result = ProjectSchema.safeParse(input);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, issues: toValidationIssues(result.error) };
}

/** One line per issue, for logs and error responses. */
export function describeIssues(issues: readonly ValidationIssue[]): string {
  return issues.map(({ path, message }) => (path ? `${path}: ${message}` : message)).join('\n');
}
