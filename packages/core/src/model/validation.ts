import type { z } from 'zod';
import type { BuiltInCheck, IssueCode, IssueValues, ValidationIssue } from './issues';
import { formatPath, ProjectSchema, type Project } from './project';

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; issues: ValidationIssue[] };

interface IssueParams {
  issueCode?: IssueCode;
  values?: IssueValues;
}

export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => {
    const params = (issue.code === 'custom' ? issue.params : undefined) as IssueParams | undefined;
    const base = { path: formatPath(issue.path), message: issue.message };
    return params?.issueCode
      ? { ...base, code: params.issueCode, values: params.values ?? {} }
      : { ...base, check: builtInCheck(issue) };
  });
}

function builtInCheck(issue: z.core.$ZodIssue): BuiltInCheck {
  switch (issue.code) {
    case 'too_small':
    case 'too_big':
      return {
        kind: issue.code,
        origin: issue.origin,
        limit: Number(issue.code === 'too_small' ? issue.minimum : issue.maximum),
        inclusive: issue.inclusive ?? false,
      };
    case 'invalid_type':
      return { kind: 'invalid_type', expected: issue.expected };
    case 'invalid_format':
    case 'invalid_value':
      return { kind: issue.code };
    default:
      return { kind: 'other' };
  }
}

/**
 * Checks everything that must always hold, also for an unfinished project in the editor
 * ("storable"). Whether a stage can be previewed or exported is checkRenderReadiness().
 */
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
